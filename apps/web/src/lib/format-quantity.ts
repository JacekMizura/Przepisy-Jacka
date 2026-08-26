/**
 * Polish display formatting for quantities.
 * API still returns fixed 3-decimal strings — UI strips insignificant zeros.
 */

const UNIT_LABELS: Record<string, string> = {
  piece: "szt.",
  gram: "g",
  kilogram: "kg",
  milliliter: "ml",
  liter: "l",
  teaspoon: "łyżeczka",
  tablespoon: "łyżka",
  cup: "szklanka",
  pinch: "szczypta",
  package: "opakowanie",
  to_taste: "do smaku",
};

export function formatQuantityNumber(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  }).format(numeric);
}

export function formatQuantityWithUnit(
  quantity: string | number | null | undefined,
  unit: string | null | undefined,
): string {
  if (unit === "to_taste") {
    return UNIT_LABELS["to_taste"] ?? "do smaku";
  }
  const amount = formatQuantityNumber(quantity);
  if (!unit) {
    return amount || "—";
  }
  const label = UNIT_LABELS[unit] ?? unit;
  if (!amount) {
    return label;
  }
  return `${amount} ${label}`;
}

export function unitLabel(unit: string | null | undefined): string {
  if (!unit) {
    return "";
  }
  return UNIT_LABELS[unit] ?? unit;
}

export function formatPackagePurchase(
  packageCount: number | null | undefined,
  optionName: string | null | undefined,
  fallbackQuantity: string | null | undefined,
  fallbackUnit: string | null | undefined,
): string {
  if (packageCount && optionName) {
    return `${formatQuantityNumber(packageCount)} × ${optionName}`;
  }
  return formatQuantityWithUnit(fallbackQuantity, fallbackUnit);
}
