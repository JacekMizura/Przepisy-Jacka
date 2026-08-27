import { formatQuantity } from '../common/quantity';
import { Prisma, ProductUnit } from '../generated/prisma/client';

export type NutritionLookupStatus =
  'found' | 'not_found' | 'incomplete' | 'provider_error' | 'rate_limited';

export type MappedNutritionValues = {
  baseQuantity: string;
  baseUnit: ProductUnit;
  kcal: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
  fiberGrams: string | null;
  saltGrams: string | null;
  sugarsGrams: string | null;
  saturatedFatGrams: string | null;
};

export type MappedOffLookup = {
  status: NutritionLookupStatus;
  message: string;
  ean: string;
  productName: string | null;
  brand: string | null;
  nutrition: MappedNutritionValues | null;
  missingFields: string[];
  fetchedAt: string;
  attribution: 'Open Food Facts';
};

type OffNutriments = Record<string, unknown>;

export type OffProductPayload = {
  status: number;
  code?: string;
  product?: {
    code?: string;
    product_name?: string;
    brands?: string;
    nutrition_data_per?: string;
    nutriments?: OffNutriments;
  };
};

const ATTRIBUTION = 'Open Food Facts' as const;

function decimalFromUnknown(value: unknown): Prisma.Decimal | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return new Prisma.Decimal(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      const parsed = new Prisma.Decimal(value.trim().replace(',', '.'));
      if (parsed.isNeg()) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function nutriment(
  nutriments: OffNutriments,
  ...keys: string[]
): Prisma.Decimal | null {
  for (const key of keys) {
    if (key in nutriments) {
      const value = decimalFromUnknown(nutriments[key]);
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
}

function mapBaseUnit(
  nutritionDataPer: string | undefined,
): { baseQuantity: Prisma.Decimal; baseUnit: ProductUnit } | null {
  const normalized = nutritionDataPer?.trim().toLowerCase();
  if (normalized === '100g') {
    return {
      baseQuantity: new Prisma.Decimal(100),
      baseUnit: ProductUnit.gram,
    };
  }
  if (normalized === '100ml') {
    return {
      baseQuantity: new Prisma.Decimal(100),
      baseUnit: ProductUnit.milliliter,
    };
  }
  return null;
}

/**
 * Mapuje odpowiedź Open Food Facts na wartości odżywcze.
 * Nie przelicza g↔ml ani na sztuki. Brak wartości ≠ zero.
 */
export function mapOpenFoodFactsProduct(
  ean: string,
  payload: OffProductPayload,
  fetchedAt: Date = new Date(),
): MappedOffLookup {
  const fetchedIso = fetchedAt.toISOString();
  const base = {
    ean,
    fetchedAt: fetchedIso,
    attribution: ATTRIBUTION,
    productName: null as string | null,
    brand: null as string | null,
    nutrition: null as MappedNutritionValues | null,
    missingFields: [] as string[],
  };

  if (payload.status !== 1 || !payload.product) {
    return {
      ...base,
      status: 'not_found',
      message: 'Nie znaleziono produktu o tym kodzie EAN w Open Food Facts.',
    };
  }

  const product = payload.product;
  const productName = product.product_name?.trim() || null;
  const brand = product.brands?.trim() || null;
  const nutriments = product.nutriments ?? {};

  const baseUnitMapping = mapBaseUnit(product.nutrition_data_per);
  if (!baseUnitMapping) {
    return {
      ...base,
      productName,
      brand,
      status: 'incomplete',
      message:
        product.nutrition_data_per === 'serving'
          ? 'Open Food Facts podaje wartości tylko na porcję — nie przeliczamy ich na 100 g/ml ani na sztuki.'
          : 'Brak obsługiwanej bazy wartości odżywczych (oczekiwane 100g lub 100ml).',
      missingFields: ['nutrition_data_per'],
    };
  }

  const kcal = nutriment(
    nutriments,
    'energy-kcal_100g',
    'energy-kcal',
    'energy-kcal_value',
  );
  const protein = nutriment(nutriments, 'proteins_100g', 'proteins');
  const carbs = nutriment(nutriments, 'carbohydrates_100g', 'carbohydrates');
  const fat = nutriment(nutriments, 'fat_100g', 'fat');

  const missingFields: string[] = [];
  if (kcal === null) {
    missingFields.push('kcal');
  }
  if (protein === null) {
    missingFields.push('proteinGrams');
  }
  if (carbs === null) {
    missingFields.push('carbsGrams');
  }
  if (fat === null) {
    missingFields.push('fatGrams');
  }

  if (missingFields.length > 0) {
    return {
      ...base,
      productName,
      brand,
      status: 'incomplete',
      message: `Znaleziono produkt, ale brakuje wymaganych wartości odżywczych (${missingFields.join(', ')}). Możesz uzupełnić je ręcznie.`,
      missingFields,
    };
  }

  const fiber = nutriment(nutriments, 'fiber_100g', 'fiber');
  const salt = nutriment(nutriments, 'salt_100g', 'salt');
  const sugars = nutriment(nutriments, 'sugars_100g', 'sugars');
  const saturatedFat = nutriment(
    nutriments,
    'saturated-fat_100g',
    'saturated-fat',
  );

  return {
    ...base,
    productName,
    brand,
    status: 'found',
    message: 'Znaleziono wartości odżywcze w Open Food Facts.',
    missingFields: [],
    nutrition: {
      baseQuantity: formatQuantity(baseUnitMapping.baseQuantity),
      baseUnit: baseUnitMapping.baseUnit,
      kcal: formatQuantity(kcal!),
      proteinGrams: formatQuantity(protein!),
      carbsGrams: formatQuantity(carbs!),
      fatGrams: formatQuantity(fat!),
      fiberGrams: fiber ? formatQuantity(fiber) : null,
      saltGrams: salt ? formatQuantity(salt) : null,
      sugarsGrams: sugars ? formatQuantity(sugars) : null,
      saturatedFatGrams: saturatedFat ? formatQuantity(saturatedFat) : null,
    },
  };
}
