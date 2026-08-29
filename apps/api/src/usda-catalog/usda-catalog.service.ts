import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductUnit } from '../generated/prisma/client';

import { normalizeSearchText } from '../common/normalize';
import { requireKitchenMember } from '../kitchens/kitchen-access';
import { PrismaService } from '../prisma/prisma.service';
import {
  formatDecimal3,
  scaleCatalogNutritionForProductUnit,
} from './scale-for-product-unit';
import {
  UsdaCatalogEntryDetailDto,
  UsdaCatalogSearchResponseDto,
  UsdaCatalogSuggestValuesDto,
} from './dto/usda-catalog.dto';

function fmt(value: Prisma.Decimal | null): string | null {
  return value === null ? null : formatDecimal3(value);
}

@Injectable()
export class UsdaCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    userId: string,
    kitchenId: string,
    query: string,
    page = 1,
    pageSize = 20,
  ): Promise<UsdaCatalogSearchResponseDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);

    const q = query.trim();
    if (q.length < 2) {
      throw new BadRequestException('query musi mieć co najmniej 2 znaki.');
    }

    const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
    const safeSize =
      Number.isFinite(pageSize) && pageSize >= 1 && pageSize <= 50
        ? Math.floor(pageSize)
        : 20;

    const folded = normalizeSearchText(q);
    const tokens = folded.split(' ').filter((t) => t.length > 0);
    if (tokens.length === 0) {
      throw new BadRequestException('query jest puste po normalizacji.');
    }

    const where: Prisma.UsdaFoodCatalogEntryWhereInput = {
      AND: tokens.map((token) => ({
        searchText: { contains: token },
      })),
    };

    const [total, rows] = await Promise.all([
      this.prisma.usdaFoodCatalogEntry.count({ where }),
      this.prisma.usdaFoodCatalogEntry.findMany({
        where,
        orderBy: [{ polishName: 'asc' }, { variantLabel: 'asc' }],
        skip: (safePage - 1) * safeSize,
        take: safeSize,
      }),
    ]);

    return {
      query: q,
      page: safePage,
      pageSize: safeSize,
      total,
      items: rows.map((row) => ({
        id: row.id,
        fdcId: row.fdcId,
        polishName: row.polishName,
        variantLabel: row.variantLabel,
        descriptionOriginal: row.descriptionOriginal,
        compositionMayVary: row.compositionMayVary,
        kcalPer100g: formatDecimal3(row.kcal),
        basisLabel: row.basisLabel,
        sourceDataset: row.sourceDataset,
      })),
    };
  }

  async getById(
    userId: string,
    kitchenId: string,
    entryId: string,
  ): Promise<UsdaCatalogEntryDetailDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const row = await this.prisma.usdaFoodCatalogEntry.findUnique({
      where: { id: entryId },
    });
    if (!row) {
      throw new NotFoundException('Nie znaleziono wpisu katalogu USDA.');
    }
    return this.toDetail(row);
  }

  /**
   * Podgląd wartości dopasowanych do jednostki produktu (bez zapisu).
   */
  async suggestForProductUnit(
    userId: string,
    kitchenId: string,
    entryId: string,
    productUnit: ProductUnit,
    pieceGrams?: string | null,
  ): Promise<UsdaCatalogSuggestValuesDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const row = await this.prisma.usdaFoodCatalogEntry.findUnique({
      where: { id: entryId },
    });
    if (!row) {
      throw new NotFoundException('Nie znaleziono wpisu katalogu USDA.');
    }

    const scaled = scaleCatalogNutritionForProductUnit(
      {
        kcal: row.kcal,
        proteinGrams: row.proteinGrams,
        carbsGrams: row.carbsGrams,
        fatGrams: row.fatGrams,
        fiberGrams: row.fiberGrams,
        saltGrams: row.saltGrams,
      },
      productUnit,
      pieceGrams,
    );

    const detail = this.toDetail(row);
    return {
      entry: detail,
      disclaimer:
        'Wartości referencyjne — szacunkowe. Pochodzą z USDA FoodData Central (Foundation Foods / SR Legacy).',
      compositionMayVaryNote: row.compositionMayVary
        ? 'Ser lub wędliny: konkretny wyrób może różnić się składem od wartości referencyjnych.'
        : null,
      suggested: {
        baseQuantity: formatDecimal3(scaled.baseQuantity),
        baseUnit: scaled.baseUnit,
        kcal: formatDecimal3(scaled.kcal),
        proteinGrams: formatDecimal3(scaled.proteinGrams),
        carbsGrams: formatDecimal3(scaled.carbsGrams),
        fatGrams: formatDecimal3(scaled.fatGrams),
        fiberGrams: fmt(scaled.fiberGrams),
        saltGrams: fmt(scaled.saltGrams),
        source: 'usda_fdc',
        sourceGenericFoodId: row.id,
        sourceFdcId: row.fdcId,
        sourcePieceGrams: scaled.pieceGrams
          ? formatDecimal3(scaled.pieceGrams)
          : null,
        sourceLabel: row.polishName,
        sourceFetchedAt: row.importedAt.toISOString(),
      },
      missingOptional: [
        ...(row.fiberGrams === null ? (['fiberGrams'] as const) : []),
        ...(row.saltGrams === null ? (['saltGrams'] as const) : []),
      ],
    };
  }

  private toDetail(
    row: Prisma.UsdaFoodCatalogEntryGetPayload<object>,
  ): UsdaCatalogEntryDetailDto {
    const aliases = Array.isArray(row.aliases) ? (row.aliases as string[]) : [];
    const warnings = Array.isArray(row.mappingWarnings)
      ? (row.mappingWarnings as string[])
      : [];

    return {
      id: row.id,
      fdcId: row.fdcId,
      polishName: row.polishName,
      aliases,
      descriptionOriginal: row.descriptionOriginal,
      variantLabel: row.variantLabel,
      dataType: row.dataType,
      category: row.category,
      compositionMayVary: row.compositionMayVary,
      basisLabel: row.basisLabel,
      sourceDataset: row.sourceDataset,
      sourceRelease: row.sourceRelease,
      sourceUrl: row.sourceUrl,
      catalogVersion: row.catalogVersion,
      importedAt: row.importedAt.toISOString(),
      publicationDate: row.publicationDate,
      nutritionPer100g: {
        kcal: formatDecimal3(row.kcal),
        proteinGrams: formatDecimal3(row.proteinGrams),
        carbsGrams: formatDecimal3(row.carbsGrams),
        fatGrams: formatDecimal3(row.fatGrams),
        fiberGrams: fmt(row.fiberGrams),
        saltGrams: fmt(row.saltGrams),
        sodiumMg: fmt(row.sodiumMg),
      },
      energyField: row.energyField,
      carbsMethod: row.carbsMethod,
      carbsApproximate: row.carbsApproximate,
      mappingWarnings: warnings,
      disclaimer: 'Wartości referencyjne — szacunkowe (USDA FoodData Central).',
    };
  }
}
