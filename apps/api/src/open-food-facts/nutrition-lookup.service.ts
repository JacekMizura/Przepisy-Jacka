import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppEnv } from '../config/env';
import { requireKitchenMember } from '../kitchens/kitchen-access';
import { PrismaService } from '../prisma/prisma.service';
import { EAN_PATTERN } from '../stock/dto/product.dto';
import {
  mapOpenFoodFactsProduct,
  type MappedOffLookup,
  type OffProductPayload,
} from './map-off-product';
import {
  OPEN_FOOD_FACTS_CLIENT,
  type OpenFoodFactsClient,
} from './open-food-facts.client';
import { NutritionLookupResultDto } from './dto/nutrition-lookup.dto';

const ERROR_CACHE_TTL_MS = 60_000;

function isOffProductPayload(value: unknown): value is OffProductPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return 'status' in value && typeof value.status === 'number';
}

@Injectable()
export class NutritionLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    @Inject(OPEN_FOOD_FACTS_CLIENT)
    private readonly offClient: OpenFoodFactsClient,
  ) {}

  async lookupByEan(
    userId: string,
    kitchenId: string,
    rawEan: string,
  ): Promise<NutritionLookupResultDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);

    const ean = rawEan.trim();
    if (!EAN_PATTERN.test(ean)) {
      throw new BadRequestException('ean musi mieć 8, 12, 13 lub 14 cyfr.');
    }

    const cached = await this.readCache(ean);
    if (cached) {
      return toDto(cached);
    }

    const fetchedAt = new Date();
    const fetchResult = await this.offClient.fetchProductByEan(ean);

    let mapped: MappedOffLookup;

    if (fetchResult.kind === 'rate_limited') {
      mapped = {
        status: 'rate_limited',
        message:
          'Open Food Facts chwilowo ogranicza liczbę zapytań. Spróbuj ponownie za chwilę albo wpisz wartości ręcznie.',
        ean,
        productName: null,
        brand: null,
        nutrition: null,
        missingFields: [],
        fetchedAt: fetchedAt.toISOString(),
        attribution: 'Open Food Facts',
      };
    } else if (
      fetchResult.kind === 'network_error' ||
      fetchResult.kind === 'http_error'
    ) {
      mapped = {
        status: 'provider_error',
        message:
          'Nie udało się pobrać danych z Open Food Facts. Sprawdź połączenie albo wpisz wartości ręcznie.',
        ean,
        productName: null,
        brand: null,
        nutrition: null,
        missingFields: [],
        fetchedAt: fetchedAt.toISOString(),
        attribution: 'Open Food Facts',
      };
    } else if (!isOffProductPayload(fetchResult.body)) {
      mapped = {
        status: 'provider_error',
        message:
          'Open Food Facts zwróciło niepoprawną odpowiedź. Wpisz wartości ręcznie.',
        ean,
        productName: null,
        brand: null,
        nutrition: null,
        missingFields: [],
        fetchedAt: fetchedAt.toISOString(),
        attribution: 'Open Food Facts',
      };
    } else {
      mapped = mapOpenFoodFactsProduct(ean, fetchResult.body, fetchedAt);
    }

    await this.writeCache(ean, mapped, fetchedAt);
    return toDto(mapped);
  }

  private async readCache(ean: string): Promise<MappedOffLookup | null> {
    const row = await this.prisma.openFoodFactsCache.findUnique({
      where: { ean },
    });
    if (!row) {
      return null;
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.openFoodFactsCache
        .delete({ where: { ean } })
        .catch(() => undefined);
      return null;
    }
    if (!isMappedLookup(row.payload)) {
      return null;
    }
    return row.payload;
  }

  private async writeCache(
    ean: string,
    mapped: MappedOffLookup,
    fetchedAt: Date,
  ): Promise<void> {
    const ttlSeconds = this.config.get('OPEN_FOOD_FACTS_CACHE_TTL_SECONDS', {
      infer: true,
    });
    const isTransient =
      mapped.status === 'provider_error' || mapped.status === 'rate_limited';
    const expiresAt = new Date(
      fetchedAt.getTime() +
        (isTransient ? ERROR_CACHE_TTL_MS : ttlSeconds * 1000),
    );

    await this.prisma.openFoodFactsCache.upsert({
      where: { ean },
      create: {
        ean,
        status: mapped.status,
        payload: mapped,
        fetchedAt,
        expiresAt,
      },
      update: {
        status: mapped.status,
        payload: mapped,
        fetchedAt,
        expiresAt,
      },
    });
  }
}

function isMappedLookup(value: unknown): value is MappedOffLookup {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as { status?: unknown; ean?: unknown };
  return typeof record.status === 'string' && typeof record.ean === 'string';
}

function toDto(mapped: MappedOffLookup): NutritionLookupResultDto {
  return {
    status: mapped.status,
    message: mapped.message,
    ean: mapped.ean,
    productName: mapped.productName,
    brand: mapped.brand,
    nutrition: mapped.nutrition
      ? {
          baseQuantity: mapped.nutrition.baseQuantity,
          baseUnit: mapped.nutrition.baseUnit,
          kcal: mapped.nutrition.kcal,
          proteinGrams: mapped.nutrition.proteinGrams,
          carbsGrams: mapped.nutrition.carbsGrams,
          fatGrams: mapped.nutrition.fatGrams,
          fiberGrams: mapped.nutrition.fiberGrams,
          saltGrams: mapped.nutrition.saltGrams,
          sugarsGrams: mapped.nutrition.sugarsGrams,
          saturatedFatGrams: mapped.nutrition.saturatedFatGrams,
        }
      : null,
    missingFields: mapped.missingFields,
    fetchedAt: mapped.fetchedAt,
    attribution: mapped.attribution,
  };
}
