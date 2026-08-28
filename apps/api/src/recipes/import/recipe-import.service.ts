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
import {
  extractRecipesFromFetchedHtml,
  extractRecipesFromTextInput,
} from './extract-pipeline';
import { parseIngredientLine } from './parse-ingredient-line';
import { safeFetchHttps, type SafeFetchResult } from './safe-http-fetch';
import type { ExtractedRecipeCandidate } from './types';
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

    const mode = dto.mode ?? (dto.text ? 'text' : 'url');

    if (mode === 'text') {
      return this.previewFromText(userId, kitchenId, dto);
    }
    return this.previewFromUrl(userId, kitchenId, dto);
  }

  private async previewFromUrl(
    userId: string,
    kitchenId: string,
    dto: PreviewRecipeImportDto,
  ): Promise<RecipeImportPreviewDto> {
    if (!dto.url?.trim()) {
      throw new BadRequestException('Podaj adres HTTPS przepisu.');
    }

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

    const extracted = extractRecipesFromFetchedHtml(
      fetched.body,
      fetched.finalUrl,
    );

    if (extracted.candidates.length === 0) {
      if (extracted.suggestPasteCaption) {
        return {
          sourceUrl: fetched.finalUrl,
          importIdempotencyKey: randomUUID(),
          importedAt: new Date().toISOString(),
          extractionMethod: null,
          fromUrlFetch: true,
          suggestPasteCaption: true,
          candidates: [],
          existingFromSameSource: await this.findVisibleBySourceUrl(
            userId,
            kitchenId,
            fetched.finalUrl,
          ),
        };
      }
      throw new BadRequestException(
        extracted.message ??
          'Na stronie nie znaleziono obsługiwanego przepisu.',
      );
    }

    return this.toPreviewDto({
      userId,
      kitchenId,
      sourceUrl: fetched.finalUrl,
      extractionMethod: extracted.method,
      fromUrlFetch: true,
      suggestPasteCaption: extracted.suggestPasteCaption,
      candidates: extracted.candidates,
    });
  }

  private async previewFromText(
    userId: string,
    kitchenId: string,
    dto: PreviewRecipeImportDto,
  ): Promise<RecipeImportPreviewDto> {
    if (!dto.text?.trim()) {
      throw new BadRequestException('Wklej tekst przepisu.');
    }

    let optionalSource: string | null = null;
    if (dto.sourceUrl?.trim()) {
      try {
        optionalSource = assertPublicHttpsUrl(dto.sourceUrl).toString();
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : 'Niepoprawny opcjonalny adres źródła.',
        );
      }
    }

    const extracted = extractRecipesFromTextInput(dto.text, optionalSource);
    if (extracted.candidates.length === 0) {
      throw new BadRequestException(
        extracted.message ?? 'Nie udało się rozpoznać przepisu w tekście.',
      );
    }

    return this.toPreviewDto({
      userId,
      kitchenId,
      sourceUrl: optionalSource,
      extractionMethod: extracted.method,
      fromUrlFetch: false,
      suggestPasteCaption: false,
      candidates: extracted.candidates,
    });
  }

  private async toPreviewDto(input: {
    userId: string;
    kitchenId: string;
    sourceUrl: string | null;
    extractionMethod: string | null;
    fromUrlFetch: boolean;
    suggestPasteCaption: boolean;
    candidates: ExtractedRecipeCandidate[];
  }): Promise<RecipeImportPreviewDto> {
    const products = await this.prisma.product.findMany({
      where: { kitchenId: input.kitchenId },
      select: { id: true, name: true, normalizedName: true },
      orderBy: { name: 'asc' },
    });
    const categories = await this.prisma.recipeCategory.findMany({
      where: { kitchenId: input.kitchenId },
      select: { id: true, name: true, normalizedName: true },
    });

    const candidates = input.candidates.map((candidate, index) => {
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
        unassignedFragments: candidate.unassignedFragments ?? [],
      };
    });

    const existingFromSameSource = input.sourceUrl
      ? await this.findVisibleBySourceUrl(
          input.userId,
          input.kitchenId,
          input.sourceUrl,
        )
      : [];

    return {
      sourceUrl: input.sourceUrl,
      importIdempotencyKey: randomUUID(),
      importedAt: new Date().toISOString(),
      extractionMethod: input.extractionMethod,
      fromUrlFetch: input.fromUrlFetch,
      suggestPasteCaption: input.suggestPasteCaption,
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
      finalUrl: aniaFixtureFinalUrl(safeName),
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

function aniaFixtureFinalUrl(safeName: string): string {
  if (safeName.startsWith('ania-')) {
    return `https://aniagotuje.pl/przepis/${safeName}`;
  }
  if (safeName === 'instagram-empty') {
    return 'https://www.instagram.com/p/fixture-empty/';
  }
  return `https://recipe-import.test/${safeName}`;
}
