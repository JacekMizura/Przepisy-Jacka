import type { components } from "@moja-kuchnia/api-client";

type ShoppingListItemStatus =
  components["schemas"]["UpdateShoppingListItemStatusDto"]["status"];
type ShoppingInputUnit = NonNullable<
  components["schemas"]["ShoppingListItemDto"]["plannedUnit"]
>;

export const SHOPPING_STATUS_LABELS: Record<ShoppingListItemStatus, string> = {
  pending: "Do kupienia",
  bought: "Kupione",
  skipped: "Pominięte",
};

export const INPUT_UNIT_LABELS: Record<ShoppingInputUnit, string> = {
  piece: "szt",
  gram: "g",
  kilogram: "kg",
  milliliter: "ml",
  liter: "l",
};

export function formatPlannedQuantity(
  quantity: string | null | undefined,
  unit: ShoppingInputUnit | null | undefined,
): string {
  if (!quantity) {
    return "—";
  }
  if (!unit) {
    return quantity;
  }
  return `${quantity} ${INPUT_UNIT_LABELS[unit]}`;
}

export function formatPriceMinor(minor: number, currency = "PLN"): string {
  const zloty = (minor / 100).toFixed(2).replace(".", ",");
  return `${zloty} ${currency}`;
}
