import type { components } from "@moja-kuchnia/api-client";

import {
  formatPackagePurchase,
  formatQuantityNumber,
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
  const parts = formatShoppingPurchaseParts(item);
  if (!parts) {
    return "";
  }
  return parts.detail ? `${parts.amount}\u00A0${parts.detail}` : parts.amount;
}

/** Ilość do wyróżnienia: duża liczba + opis (opakowanie / jednostka). */
export function formatShoppingPurchaseParts(
  item: ShoppingListItem,
): { amount: string; detail: string | null } | null {
  const isPackaged =
    item.packageCount != null &&
    item.packageCount > 0 &&
    item.product?.purchaseMode !== "exact";

  if (isPackaged) {
    const option = item.purchaseOption;
    const content = option
      ? formatQuantityWithUnit(option.contentQuantity, option.contentUnit)
      : "";
    const name = option?.name?.trim() || "opakowanie";
    const detail =
      content && !name.toLowerCase().includes(content.toLowerCase())
        ? `${name} · ${content}`
        : name;
    return {
      amount: formatQuantityNumber(item.packageCount),
      detail: `× ${detail}`,
    };
  }

  if (item.plannedQuantity) {
    const amount = formatQuantityNumber(item.plannedQuantity);
    const unitLabel = item.plannedUnit
      ? INPUT_UNIT_LABELS[item.plannedUnit]
      : null;
    return { amount, detail: unitLabel };
  }

  const fallback = formatPackagePurchase(
    item.packageCount,
    item.purchaseOption?.name ?? null,
    item.plannedQuantity,
    item.plannedUnit,
  );
  if (!fallback) {
    return null;
  }
  return { amount: fallback, detail: null };
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

export function formatStockOnHand(
  quantity: string | null | undefined,
  unit: components["schemas"]["ShoppingListItemDto"]["stockUnit"],
): string | null {
  if (!quantity) {
    return null;
  }
  const formatted = formatQuantityWithUnit(quantity, unit ?? undefined);
  return formatted || null;
}
