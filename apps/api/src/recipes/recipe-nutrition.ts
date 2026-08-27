import { Prisma } from '../generated/prisma/client';
import {
  type ProductUnit,
  type RecipeIngredientUnit,
} from '../generated/prisma/client';

import {
  convertRecipeQuantityToProductBase,
  scaleIngredientQuantity,
} from './recipe-availability';

/** Wartości odżywcze podajemy z dokładnością do 0,01. */
const NUTRITION_DECIMAL_PLACES = 2;

export type NutritionIngredientInput = {
  id: string;
  name: string;
  quantity: Prisma.Decimal | null;
  unit: RecipeIngredientUnit;
  productId: string | null;
};

export type ProductNutritionInput = {
  baseQuantity: Prisma.Decimal;
  baseUnit: ProductUnit;
  kcal: Prisma.Decimal;
  proteinGrams: Prisma.Decimal;
  carbsGrams: Prisma.Decimal;
  fatGrams: Prisma.Decimal;
};

export type NutritionTotals = {
  kcal: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
};

export type RecipeNutritionResult = {
  isComplete: boolean;
  countedIngredients: number;
  totalIngredients: number;
  missingIngredientNames: string[];
  recipe: NutritionTotals | null;
  perServing: NutritionTotals | null;
};

type DecimalTotals = {
  kcal: Prisma.Decimal;
  proteinGrams: Prisma.Decimal;
  carbsGrams: Prisma.Decimal;
  fatGrams: Prisma.Decimal;
};

/**
 * Liczy wartości odżywcze wyłącznie ze składników powiązanych z produktem,
 * który ma zapisane wartości odżywcze i jednostkę przeliczalną na bazę produktu.
 * Brak danych nigdy nie oznacza zera — wtedy sumy są `null`.
 */
export function computeRecipeNutrition(input: {
  baseServings: number;
  servings: number;
  ingredients: NutritionIngredientInput[];
  nutritionByProductId: Map<string, ProductNutritionInput>;
}): RecipeNutritionResult {
  const totals: DecimalTotals = {
    kcal: new Prisma.Decimal(0),
    proteinGrams: new Prisma.Decimal(0),
    carbsGrams: new Prisma.Decimal(0),
    fatGrams: new Prisma.Decimal(0),
  };

  const missingIngredientNames: string[] = [];
  let countedIngredients = 0;

  for (const ingredient of input.ingredients) {
    const resolved = resolveUsedQuantityInProductBase(
      ingredient,
      input.baseServings,
      input.servings,
      input.nutritionByProductId,
    );
    if (resolved === null) {
      missingIngredientNames.push(ingredient.name);
      continue;
    }

    const { nutrition, quantity } = resolved;
    const factor = quantity.div(nutrition.baseQuantity);
    totals.kcal = totals.kcal.add(nutrition.kcal.mul(factor));
    totals.proteinGrams = totals.proteinGrams.add(
      nutrition.proteinGrams.mul(factor),
    );
    totals.carbsGrams = totals.carbsGrams.add(nutrition.carbsGrams.mul(factor));
    totals.fatGrams = totals.fatGrams.add(nutrition.fatGrams.mul(factor));
    countedIngredients += 1;
  }

  const totalIngredients = input.ingredients.length;
  const hasData = countedIngredients > 0;

  return {
    isComplete: totalIngredients > 0 && missingIngredientNames.length === 0,
    countedIngredients,
    totalIngredients,
    missingIngredientNames,
    recipe: hasData ? formatTotals(totals) : null,
    perServing:
      hasData && input.servings > 0
        ? formatTotals(divideTotals(totals, input.servings))
        : null,
  };
}

function resolveUsedQuantityInProductBase(
  ingredient: NutritionIngredientInput,
  baseServings: number,
  servings: number,
  nutritionByProductId: Map<string, ProductNutritionInput>,
): { quantity: Prisma.Decimal; nutrition: ProductNutritionInput } | null {
  if (!ingredient.productId || ingredient.quantity === null) {
    return null;
  }
  const nutrition = nutritionByProductId.get(ingredient.productId);
  if (!nutrition || nutrition.baseQuantity.lte(0)) {
    return null;
  }
  const scaled = scaleIngredientQuantity(
    ingredient.quantity,
    baseServings,
    servings,
  );
  if (scaled === null) {
    return null;
  }
  const converted = convertRecipeQuantityToProductBase(
    scaled,
    ingredient.unit,
    nutrition.baseUnit,
  );
  if (converted === null) {
    return null;
  }
  return { quantity: converted, nutrition };
}

function divideTotals(totals: DecimalTotals, divisor: number): DecimalTotals {
  return {
    kcal: totals.kcal.div(divisor),
    proteinGrams: totals.proteinGrams.div(divisor),
    carbsGrams: totals.carbsGrams.div(divisor),
    fatGrams: totals.fatGrams.div(divisor),
  };
}

function formatTotals(totals: DecimalTotals): NutritionTotals {
  return {
    kcal: formatNutritionValue(totals.kcal),
    proteinGrams: formatNutritionValue(totals.proteinGrams),
    carbsGrams: formatNutritionValue(totals.carbsGrams),
    fatGrams: formatNutritionValue(totals.fatGrams),
  };
}

export function formatNutritionValue(value: Prisma.Decimal): string {
  return value.toFixed(NUTRITION_DECIMAL_PLACES);
}
