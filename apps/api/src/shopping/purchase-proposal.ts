import { Prisma } from '../generated/prisma/client';
import {
  ProductPurchaseMode,
  ProductUnit,
  RecipeIngredientUnit,
  ShoppingInputUnit,
} from '../generated/prisma/client';

export type PurchaseOptionInput = {
  id: string;
  name: string;
  contentQuantity: Prisma.Decimal;
  contentUnit: ProductUnit;
  isDefault: boolean;
  isActive: boolean;
};

export type PurchaseProposal = {
  mode: 'packages' | 'exact' | 'unconfigured';
  purchaseOptionId: string | null;
  purchaseOptionName: string | null;
  packageCount: number | null;
  packageContentQuantity: string | null;
  packageContentUnit: ProductUnit | null;
  totalPurchaseQuantity: string;
  totalPurchaseUnit: ShoppingInputUnit;
  alternatives: Array<{
    purchaseOptionId: string;
    purchaseOptionName: string;
    packageCount: number;
    packageContentQuantity: string;
    packageContentUnit: ProductUnit;
    totalPurchaseQuantity: string;
    totalPurchaseUnit: ShoppingInputUnit;
  }>;
};

function formatQty(value: Prisma.Decimal): string {
  return value.toFixed(3);
}

export function productUnitToShoppingInputUnit(
  unit: ProductUnit,
): ShoppingInputUnit {
  switch (unit) {
    case ProductUnit.piece:
      return ShoppingInputUnit.piece;
    case ProductUnit.gram:
      return ShoppingInputUnit.gram;
    case ProductUnit.milliliter:
      return ShoppingInputUnit.milliliter;
    default: {
      const exhaustive: never = unit;
      return exhaustive;
    }
  }
}

export function recipeUnitToShoppingInputUnitSafe(
  unit: RecipeIngredientUnit,
): ShoppingInputUnit | null {
  switch (unit) {
    case RecipeIngredientUnit.piece:
      return ShoppingInputUnit.piece;
    case RecipeIngredientUnit.gram:
      return ShoppingInputUnit.gram;
    case RecipeIngredientUnit.kilogram:
      return ShoppingInputUnit.kilogram;
    case RecipeIngredientUnit.milliliter:
      return ShoppingInputUnit.milliliter;
    case RecipeIngredientUnit.liter:
      return ShoppingInputUnit.liter;
    default:
      return null;
  }
}

/** Ceil(gap / packageContent) — full packages covering the gap. */
export function proposePackageCount(
  gapQuantity: Prisma.Decimal,
  packageContent: Prisma.Decimal,
): number {
  if (packageContent.lte(0)) {
    throw new Error('Zawartość opakowania musi być większa od zera.');
  }
  if (gapQuantity.lte(0)) {
    return 0;
  }
  return gapQuantity
    .div(packageContent)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_CEIL)
    .toNumber();
}

function buildExactProposal(input: {
  gapInProductBase: Prisma.Decimal;
  productUnit: ProductUnit;
  exactQuantity?: Prisma.Decimal | null;
}): PurchaseProposal {
  const exact = input.exactQuantity ?? input.gapInProductBase;
  return {
    mode: 'exact',
    purchaseOptionId: null,
    purchaseOptionName: null,
    packageCount: null,
    packageContentQuantity: null,
    packageContentUnit: null,
    totalPurchaseQuantity: formatQty(exact),
    totalPurchaseUnit: productUnitToShoppingInputUnit(input.productUnit),
    alternatives: [],
  };
}

function buildUnconfiguredProposal(input: {
  gapInProductBase: Prisma.Decimal;
  productUnit: ProductUnit;
}): PurchaseProposal {
  return {
    mode: 'unconfigured',
    purchaseOptionId: null,
    purchaseOptionName: null,
    packageCount: null,
    packageContentQuantity: null,
    packageContentUnit: null,
    totalPurchaseQuantity: formatQty(input.gapInProductBase),
    totalPurchaseUnit: productUnitToShoppingInputUnit(input.productUnit),
    alternatives: [],
  };
}

export function buildPurchaseProposal(input: {
  gapInProductBase: Prisma.Decimal;
  productUnit: ProductUnit;
  purchaseMode: ProductPurchaseMode;
  options: PurchaseOptionInput[];
  preferredOptionId?: string | null;
  overridePackageCount?: number | null;
  exactQuantity?: Prisma.Decimal | null;
}): PurchaseProposal {
  if (input.purchaseMode === ProductPurchaseMode.unconfigured) {
    return buildUnconfiguredProposal(input);
  }

  if (input.purchaseMode === ProductPurchaseMode.exact) {
    return buildExactProposal(input);
  }

  const active = input.options.filter((option) => option.isActive);
  if (active.length === 0) {
    throw new Error('Produkt w trybie packaged nie ma aktywnych opcji zakupu.');
  }

  const preferred =
    (input.preferredOptionId
      ? active.find((option) => option.id === input.preferredOptionId)
      : undefined) ??
    active.find((option) => option.isDefault) ??
    active[0]!;

  const alternatives = active.map((option) => {
    const count = proposePackageCount(
      input.gapInProductBase,
      option.contentQuantity,
    );
    const total = option.contentQuantity.mul(count);
    return {
      purchaseOptionId: option.id,
      purchaseOptionName: option.name,
      packageCount: count,
      packageContentQuantity: formatQty(option.contentQuantity),
      packageContentUnit: option.contentUnit,
      totalPurchaseQuantity: formatQty(total),
      totalPurchaseUnit: productUnitToShoppingInputUnit(option.contentUnit),
    };
  });

  const selectedAlt = alternatives.find(
    (item) => item.purchaseOptionId === preferred.id,
  )!;
  const packageCount =
    input.overridePackageCount !== undefined &&
    input.overridePackageCount !== null
      ? Math.max(1, Math.floor(input.overridePackageCount))
      : selectedAlt.packageCount;
  const total = preferred.contentQuantity.mul(packageCount);

  return {
    mode: 'packages',
    purchaseOptionId: preferred.id,
    purchaseOptionName: preferred.name,
    packageCount,
    packageContentQuantity: formatQty(preferred.contentQuantity),
    packageContentUnit: preferred.contentUnit,
    totalPurchaseQuantity: formatQty(total),
    totalPurchaseUnit: productUnitToShoppingInputUnit(preferred.contentUnit),
    alternatives,
  };
}
