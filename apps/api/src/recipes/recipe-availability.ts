import { Prisma } from '../generated/prisma/client';
import {
  ProductUnit,
  RecipeIngredientUnit,
  type Product,
  type RecipeIngredient,
  type StockItem,
} from '../generated/prisma/client';

import { formatQuantity } from '../common/quantity';
import {
  buildPurchaseProposal,
  type PurchaseOptionInput,
  type PurchaseProposal,
} from '../shopping/purchase-proposal';

export type IngredientAvailabilityStatus =
  'available' | 'partial' | 'missing' | 'unknown';

export type RecipeIngredientAvailability = {
  ingredientId: string;
  name: string;
  productId: string | null;
  productName: string | null;
  scaledQuantity: string | null;
  unit: RecipeIngredientUnit;
  note: string | null;
  sortOrder: number;
  status: IngredientAvailabilityStatus;
  availableQuantity: string | null;
  availableUnit: ProductUnit | null;
  gapQuantity: string | null;
  gapUnit: RecipeIngredientUnit | null;
  requiredQuantity: string | null;
  purchaseProposal: PurchaseProposal | null;
};

export type RecipeAvailabilityResult = {
  recipeId: string;
  servings: number;
  baseServings: number;
  ingredients: RecipeIngredientAvailability[];
};

type IngredientWithProduct = RecipeIngredient & {
  product: Product | null;
};

type PurchaseOptionRow = PurchaseOptionInput;

type StockItemRow = Pick<StockItem, 'productId' | 'quantity' | 'expiresAt'>;

const RECIPE_UNIT_BASE: Partial<
  Record<
    RecipeIngredientUnit,
    { base: 'piece' | 'gram' | 'milliliter'; factor: number }
  >
> = {
  [RecipeIngredientUnit.piece]: { base: 'piece', factor: 1 },
  [RecipeIngredientUnit.gram]: { base: 'gram', factor: 1 },
  [RecipeIngredientUnit.kilogram]: { base: 'gram', factor: 1000 },
  [RecipeIngredientUnit.milliliter]: { base: 'milliliter', factor: 1 },
  [RecipeIngredientUnit.liter]: { base: 'milliliter', factor: 1000 },
};

const PRODUCT_UNIT_BASE: Record<ProductUnit, 'piece' | 'gram' | 'milliliter'> =
  {
    [ProductUnit.piece]: 'piece',
    [ProductUnit.gram]: 'gram',
    [ProductUnit.milliliter]: 'milliliter',
  };

export function scaleIngredientQuantity(
  quantity: Prisma.Decimal | null,
  baseServings: number,
  targetServings: number,
): Prisma.Decimal | null {
  if (quantity === null) {
    return null;
  }
  if (baseServings <= 0 || targetServings <= 0) {
    throw new Error('Porcje muszą być większe od zera.');
  }
  return quantity.mul(targetServings).div(baseServings);
}

export function sumAvailableStock(
  stockItems: StockItemRow[],
  productId: string,
  now: Date,
): Prisma.Decimal {
  return stockItems
    .filter(
      (item) =>
        item.productId === productId &&
        item.quantity.gt(0) &&
        (item.expiresAt === null || item.expiresAt > now),
    )
    .reduce((sum, item) => sum.add(item.quantity), new Prisma.Decimal(0));
}

export function convertRecipeQuantityToProductBase(
  quantity: Prisma.Decimal,
  unit: RecipeIngredientUnit,
  productUnit: ProductUnit,
): Prisma.Decimal | null {
  const recipeBase = RECIPE_UNIT_BASE[unit];
  if (!recipeBase) {
    return null;
  }
  const productBase = PRODUCT_UNIT_BASE[productUnit];
  if (recipeBase.base !== productBase) {
    return null;
  }
  return quantity.mul(recipeBase.factor);
}

export function convertProductBaseToRecipeUnit(
  quantity: Prisma.Decimal,
  unit: RecipeIngredientUnit,
): Prisma.Decimal | null {
  const recipeBase = RECIPE_UNIT_BASE[unit];
  if (!recipeBase) {
    return null;
  }
  return quantity.div(recipeBase.factor);
}

export function computeRecipeAvailability(input: {
  recipeId: string;
  baseServings: number;
  servings: number;
  ingredients: IngredientWithProduct[];
  stockItems: StockItemRow[];
  purchaseOptionsByProductId?: Map<string, PurchaseOptionRow[]>;
  now?: Date;
}): RecipeAvailabilityResult {
  const now = input.now ?? new Date();
  const purchaseOptionsByProductId: Map<string, PurchaseOptionRow[]> =
    input.purchaseOptionsByProductId ?? new Map<string, PurchaseOptionRow[]>();
  const ingredients = [...input.ingredients]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((ingredient) =>
      evaluateIngredientAvailability({
        ingredient,
        baseServings: input.baseServings,
        servings: input.servings,
        stockItems: input.stockItems,
        purchaseOptions: ingredient.productId
          ? (purchaseOptionsByProductId.get(ingredient.productId) ?? [])
          : [],
        now,
      }),
    );

  return {
    recipeId: input.recipeId,
    servings: input.servings,
    baseServings: input.baseServings,
    ingredients,
  };
}

function evaluateIngredientAvailability(input: {
  ingredient: IngredientWithProduct;
  baseServings: number;
  servings: number;
  stockItems: StockItemRow[];
  purchaseOptions: PurchaseOptionRow[];
  now: Date;
}): RecipeIngredientAvailability {
  const scaledQuantity = scaleIngredientQuantity(
    input.ingredient.quantity,
    input.baseServings,
    input.servings,
  );

  const base: RecipeIngredientAvailability = {
    ingredientId: input.ingredient.id,
    name: input.ingredient.name,
    productId: input.ingredient.productId,
    productName: input.ingredient.product?.name ?? null,
    scaledQuantity:
      scaledQuantity !== null ? formatQuantity(scaledQuantity) : null,
    unit: input.ingredient.unit,
    note: input.ingredient.note,
    sortOrder: input.ingredient.sortOrder,
    status: 'unknown',
    availableQuantity: null,
    availableUnit: null,
    gapQuantity: null,
    gapUnit: null,
    requiredQuantity: null,
    purchaseProposal: null,
  };

  if (
    !input.ingredient.productId ||
    !input.ingredient.product ||
    scaledQuantity === null ||
    !RECIPE_UNIT_BASE[input.ingredient.unit]
  ) {
    return base;
  }

  const requiredInProductBase = convertRecipeQuantityToProductBase(
    scaledQuantity,
    input.ingredient.unit,
    input.ingredient.product.defaultUnit,
  );
  if (requiredInProductBase === null) {
    return base;
  }

  const availableInProductBase = sumAvailableStock(
    input.stockItems,
    input.ingredient.productId,
    input.now,
  );

  const availableInRecipeUnit = convertProductBaseToRecipeUnit(
    availableInProductBase,
    input.ingredient.unit,
  );
  if (availableInRecipeUnit === null) {
    return base;
  }

  const gapInProductBase = requiredInProductBase.gt(availableInProductBase)
    ? requiredInProductBase.sub(availableInProductBase)
    : new Prisma.Decimal(0);
  const gapInRecipeUnit = convertProductBaseToRecipeUnit(
    gapInProductBase,
    input.ingredient.unit,
  );

  let status: IngredientAvailabilityStatus;
  if (availableInProductBase.lte(0)) {
    status = 'missing';
  } else if (gapInProductBase.lte(0)) {
    status = 'available';
  } else {
    status = 'partial';
  }

  const gapQuantityFormatted =
    gapInRecipeUnit !== null && gapInRecipeUnit.gt(0)
      ? formatQuantity(gapInRecipeUnit)
      : status === 'missing' && scaledQuantity !== null
        ? formatQuantity(scaledQuantity)
        : null;

  const purchaseProposal =
    gapInProductBase.gt(0) && input.ingredient.product
      ? buildPurchaseProposal({
          gapInProductBase,
          productUnit: input.ingredient.product.defaultUnit,
          options: input.purchaseOptions,
        })
      : null;

  return {
    ...base,
    status,
    availableQuantity: formatQuantity(availableInRecipeUnit),
    availableUnit: input.ingredient.product.defaultUnit,
    gapQuantity: gapQuantityFormatted,
    gapUnit: input.ingredient.unit,
    requiredQuantity: formatQuantity(scaledQuantity),
    purchaseProposal,
  };
}

export function recipeUnitToShoppingInputUnit(
  unit: RecipeIngredientUnit,
): 'piece' | 'gram' | 'kilogram' | 'milliliter' | 'liter' | null {
  switch (unit) {
    case RecipeIngredientUnit.piece:
      return 'piece';
    case RecipeIngredientUnit.gram:
      return 'gram';
    case RecipeIngredientUnit.kilogram:
      return 'kilogram';
    case RecipeIngredientUnit.milliliter:
      return 'milliliter';
    case RecipeIngredientUnit.liter:
      return 'liter';
    default:
      return null;
  }
}
