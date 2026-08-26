import { Prisma } from '../generated/prisma/client';
import { type ProductUnit } from '../generated/prisma/client';

import {
  convertRecipeQuantityToProductBase,
  scaleIngredientQuantity,
} from './recipe-availability';
import { type NutritionIngredientInput } from './recipe-nutrition';

export const RECIPE_COST_NOTE = 'Szacunkowo na podstawie ostatnich zakupów';

/** Cena jednostkowa w groszach na jednostkę bazową produktu. */
const UNIT_PRICE_DECIMAL_PLACES = 4;

export type ProductPriceInput = {
  productId: string;
  productName: string;
  purchasedAt: Date;
  /** Ilość z ostatniego zakupu w jednostce bazowej produktu. */
  quantity: Prisma.Decimal;
  priceMinor: number;
  baseUnit: ProductUnit;
};

export type RecipeCostPriceSource = {
  productId: string;
  productName: string;
  purchasedAt: string;
  unitPriceMinorPerBase: string;
  baseUnit: ProductUnit;
};

export type RecipeCostResult = {
  isComplete: boolean;
  countedIngredients: number;
  totalIngredients: number;
  missingIngredientNames: string[];
  recipeTotalMinor: number | null;
  perServingMinor: number | null;
  priceSources: RecipeCostPriceSource[];
  note: string;
};

/**
 * Szacuje koszt przepisu z ostatnich cen zakupu w kuchni.
 * Zaokrąglenie do pełnych groszy następuje dopiero na końcu.
 */
export function computeRecipeCost(input: {
  baseServings: number;
  servings: number;
  ingredients: NutritionIngredientInput[];
  pricesByProductId: Map<string, ProductPriceInput>;
}): RecipeCostResult {
  let total = new Prisma.Decimal(0);
  let countedIngredients = 0;
  const missingIngredientNames: string[] = [];
  const priceSources = new Map<string, RecipeCostPriceSource>();

  for (const ingredient of input.ingredients) {
    const resolved = resolveIngredientCost(
      ingredient,
      input.baseServings,
      input.servings,
      input.pricesByProductId,
    );
    if (resolved === null) {
      missingIngredientNames.push(ingredient.name);
      continue;
    }

    total = total.add(resolved.costMinor);
    countedIngredients += 1;
    priceSources.set(resolved.price.productId, {
      productId: resolved.price.productId,
      productName: resolved.price.productName,
      purchasedAt: resolved.price.purchasedAt.toISOString(),
      unitPriceMinorPerBase: resolved.unitPriceMinor.toFixed(
        UNIT_PRICE_DECIMAL_PLACES,
      ),
      baseUnit: resolved.price.baseUnit,
    });
  }

  const totalIngredients = input.ingredients.length;
  const hasData = countedIngredients > 0;

  return {
    isComplete: totalIngredients > 0 && missingIngredientNames.length === 0,
    countedIngredients,
    totalIngredients,
    missingIngredientNames,
    recipeTotalMinor: hasData ? roundToMinor(total) : null,
    perServingMinor:
      hasData && input.servings > 0
        ? roundToMinor(total.div(input.servings))
        : null,
    priceSources: [...priceSources.values()],
    note: RECIPE_COST_NOTE,
  };
}

function resolveIngredientCost(
  ingredient: NutritionIngredientInput,
  baseServings: number,
  servings: number,
  pricesByProductId: Map<string, ProductPriceInput>,
): {
  costMinor: Prisma.Decimal;
  unitPriceMinor: Prisma.Decimal;
  price: ProductPriceInput;
} | null {
  if (!ingredient.productId || ingredient.quantity === null) {
    return null;
  }
  const price = pricesByProductId.get(ingredient.productId);
  if (!price || price.quantity.lte(0)) {
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
  const usedInProductBase = convertRecipeQuantityToProductBase(
    scaled,
    ingredient.unit,
    price.baseUnit,
  );
  if (usedInProductBase === null) {
    return null;
  }

  const unitPriceMinor = new Prisma.Decimal(price.priceMinor).div(
    price.quantity,
  );
  return {
    costMinor: unitPriceMinor.mul(usedInProductBase),
    unitPriceMinor,
    price,
  };
}

function roundToMinor(value: Prisma.Decimal): number {
  return value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}
