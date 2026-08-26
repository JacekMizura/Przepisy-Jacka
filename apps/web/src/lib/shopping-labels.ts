import type { components } from "@moja-kuchnia/api-client";

import {
  formatPackagePurchase,
  formatQuantityWithUnit,
} from "@/lib/format-quantity";

type ShoppingListItemStatus =
  components["schemas"]["UpdateShoppingListItemStatusDto"]["status"];
type ShoppingInputUnit = NonNullable<
  components["schemas"]["ShoppingListItemDto"]["plannedUnit"]
>;
type ShoppingListItem = components["schemas"]["ShoppingListItemDto"];

export const SHOPPING_STATUS_LABELS: Record<ShoppingListItemStatus, string> = {
  pending: "Do kupienia",
  bought: "Kupione",
  skipped: "Pominięte",
};

export const INPUT_UNIT_LABELS: Record<ShoppingInputUnit, string> = {
  piece: "szt.",
  gram: "g",
  kilogram: "kg",
  milliliter: "ml",
  liter: "l",
};

export function formatPlannedQuantity(
  quantity: string | null | undefined,
  unit: ShoppingInputUnit | null | undefined,
): string {
  return formatQuantityWithUnit(quantity, unit);
}

export function formatShoppingPurchaseLine(item: ShoppingListItem): string {
  if (
    item.product?.purchaseMode === "exact" ||
    (!item.packageCount && !item.purchaseOptionId)
  ) {
    return formatQuantityWithUnit(item.plannedQuantity, item.plannedUnit);
  }
  return formatPackagePurchase(
    item.packageCount,
    item.purchaseOption?.name ?? null,
    item.plannedQuantity,
    item.plannedUnit,
  );
}

export function formatRequiredForRecipe(
  quantity: string | null | undefined,
  unit: ShoppingInputUnit | null | undefined,
): string | null {
  if (!quantity) {
    return null;
  }
  return formatQuantityWithUnit(quantity, unit);
}

export function formatPriceMinor(minor: number, currency = "PLN"): string {
  const zloty = (minor / 100).toFixed(2).replace(".", ",");
  return `${zloty} ${currency}`;
}
