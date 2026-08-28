import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeProductName } from '../../common/normalize';
import { type AppEnv } from '../../config/env';
import { requireKitchenMember } from '../../kitchens/kitchen-access';
import { PrismaService } from '../../prisma/prisma.service';
import { RecipeVisibility } from '../../generated/prisma/client';
import { normalizeRecipeCategoryName } from '../default-recipe-categories';
import {
  PreviewRecipeImportDto,
  RecipeImportPreviewDto,
} from '../dto/recipe-import.dto';
import { extractRecipesFromHtml } from './jsonld-recipe';
import { parseIngredientLine } from './parse-ingredient-line';
import { safeFetchHttps, type SafeFetchResult } from './safe-http-fetch';
import { assertPublicHttpsUrl } from './url-safety';

type RateBucket = number[];

@Injectable()
export class RecipeImportService {
  private readonly rateBuckets = new Map<string, RateBucket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async preview(
    userId: string,
    kitchenId: string,
    dto: PreviewRecipeImportDto,
  ): Promise<RecipeImportPreviewDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    this.assertRateLimit(userId);

    let sourceUrl: string;
    try {
      sourceUrl = assertPublicHttpsUrl(dto.url).toString();
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Niepoprawny adres URL.',
      );
    }

    let fetched: SafeFetchResult;
    try {
      fetched = await this.fetchPage(sourceUrl);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Nie udało się pobrać strony źródłowej.',
      );
    }

    const extracted = extractRecipesFromHtml(fetched.body);
    if (extracted.length === 0) {
      throw new BadRequestException(
        'Na stronie nie znaleziono obsługiwanych danych strukturalnych Recipe (JSON-LD).',
      );
    }

    const products = await this.prisma.product.findMany({
      where: { kitchenId },
      select: { id: true, name: true, normalizedName: true },
      orderBy: { name: 'asc' },
    });
    const categories = await this.prisma.recipeCategory.findMany({
      where: { kitchenId },
      select: { id: true, name: true, normalizedName: true },
    });

    const candidates = extracted.map((candidate, index) => {
      const matchedCategoryIds: string[] = [];
      const unmatchedSourceCategories: string[] = [];
      for (const sourceCategory of candidate.sourceCategories) {
        const normalized = normalizeRecipeCategoryName(sourceCategory);
        const match = categories.find(
          (category) => category.normalizedName === normalized,
        );
        if (match) {
          if (!matchedCategoryIds.includes(match.id)) {
            matchedCategoryIds.push(match.id);
          }
        } else if (sourceCategory.trim()) {
          unmatchedSourceCategories.push(sourceCategory.trim());
        }
      }

      const ingredients = candidate.ingredientLines.map((line) => {
        const parsed = parseIngredientLine(line);
        const suggested = suggestProduct(parsed.name, products);
        return {
          rawText: parsed.rawText,
          name: parsed.name,
          quantity: parsed.quantity,
          unit: parsed.unit,
          confidence: parsed.confidence,
          suggestedProductId: suggested?.id ?? null,
          suggestedProductName: suggested?.name ?? null,
          warnings: parsed.warnings,
        };
      });

      return {
        index,
        name: candidate.name,
        description: candidate.description,
        servings: candidate.servings,
        servingsRaw: candidate.servingsRaw,
        servingsAmbiguous: candidate.servingsAmbiguous,
        prepTimeMinutes: candidate.prepTimeMinutes,
        cookTimeMinutes: candidate.cookTimeMinutes,
        sourceAuthor: candidate.sourceAuthor,
        sourceCategories: candidate.sourceCategories,
        suggestedCategoryIds: matchedCategoryIds,
        unmatchedSourceCategories,
        ingredients,
        steps: candidate.steps,
        warnings: candidate.warnings,
        gaps: candidate.gaps,
      };
    });

    const existingFromSameSource = await this.findVisibleBySourceUrl(
      userId,
      kitchenId,
      fetched.finalUrl,
    );

    return {
      sourceUrl: fetched.finalUrl,
      importIdempotencyKey: randomUUID(),
      importedAt: new Date().toISOString(),
      candidates,
      existingFromSameSource,
    };
  }

  private async fetchPage(url: string): Promise<SafeFetchResult> {
    const parsed = assertPublicHttpsUrl(url);
    if (
      parsed.hostname === 'recipe-import.test' &&
      (this.config.get('NODE_ENV') === 'test' ||
        this.config.get('RECIPE_IMPORT_USE_FIXTURES', { infer: true }))
    ) {
      return this.loadTestFixture(parsed.pathname);
    }

    return safeFetchHttps(url, {
      timeoutMs: this.config.get('RECIPE_IMPORT_TIMEOUT_MS', { infer: true }),
      maxBytes: this.config.get('RECIPE_IMPORT_MAX_BYTES', { infer: true }),
      maxRedirects: this.config.get('RECIPE_IMPORT_MAX_REDIRECTS', {
        infer: true,
      }),
      userAgent: this.config.get('RECIPE_IMPORT_USER_AGENT', { infer: true }),
    });
  }

  private loadTestFixture(pathname: string): SafeFetchResult {
    const name = pathname.replace(/^\/+|\/+$/g, '') || 'basic';
    const safeName = name.replace(/[^a-z0-9_-]/gi, '');
    const filePath = join(
      process.cwd(),
      'test',
      'fixtures',
      'recipe-import',
      `${safeName}.html`,
    );
    let body: string;
    try {
      body = readFileSync(filePath, 'utf8');
    } catch {
      throw new Error(`Brak fixture importu: ${safeName}`);
    }
    return {
      finalUrl: `https://recipe-import.test/${safeName}`,
      statusCode: 200,
      contentType: 'text/html; charset=utf-8',
      body,
    };
  }

  private assertRateLimit(userId: string): void {
    const limit = this.config.get('RECIPE_IMPORT_RATE_LIMIT_PER_HOUR', {
      infer: true,
    });
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    const current = (this.rateBuckets.get(userId) ?? []).filter(
      (stamp) => now - stamp < windowMs,
    );
    if (current.length >= limit) {
      throw new HttpException(
        'Przekroczono limit importów przepisów. Spróbuj ponownie później.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.push(now);
    this.rateBuckets.set(userId, current);
  }

  private async findVisibleBySourceUrl(
    userId: string,
    kitchenId: string,
    sourceUrl: string,
  ) {
    const recipes = await this.prisma.recipe.findMany({
      where: {
        kitchenId,
        sourceUrl,
        OR: [
          { authorUserId: userId },
          { visibility: RecipeVisibility.kitchen },
        ],
      },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return recipes;
  }
}

function suggestProduct(
  ingredientName: string,
  products: Array<{ id: string; name: string; normalizedName: string }>,
): { id: string; name: string } | null {
  const needle = normalizeProductName(ingredientName);
  if (!needle) {
    return null;
  }
  const exact = products.find((product) => product.normalizedName === needle);
  if (exact) {
    return { id: exact.id, name: exact.name };
  }
  const contained = products.filter(
    (product) =>
      product.normalizedName.includes(needle) ||
      needle.includes(product.normalizedName),
  );
  if (contained.length === 1) {
    return { id: contained[0]!.id, name: contained[0]!.name };
  }
  return null;
}
