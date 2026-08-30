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

/** Convert UI quantity (possibly with comma) to API decimal string `x.xxx`. */
export function toApiQuantityString(value: string): string {
  const normalized = value.trim().replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return value.trim();
  }
  return numeric.toFixed(3);
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
  // Non-breaking space keeps amount + unit on one line (e.g. "100 ml", "4 szt.").
  return `${amount}\u00A0${label}`;
}

/**
 * Prezentacja ilości w zapasach: 2400 g → 2,4 kg, 1500 ml → 1,5 l.
 * Nie zmienia wartości API — wyłącznie UI.
 */
export function formatDisplayQuantityWithUnit(
  quantity: string | number | null | undefined,
  unit: string | null | undefined,
): string {
  if (unit === "to_taste") {
    return UNIT_LABELS["to_taste"] ?? "do smaku";
  }
  if (quantity === null || quantity === undefined || quantity === "") {
    return formatQuantityWithUnit(quantity, unit);
  }
  const numeric = typeof quantity === "number" ? quantity : Number(quantity);
  if (!Number.isFinite(numeric)) {
    return formatQuantityWithUnit(quantity, unit);
  }

  let displayValue = numeric;
  let displayUnit = unit ?? "";

  if (unit === "gram" && Math.abs(numeric) >= 1000) {
    displayValue = numeric / 1000;
    displayUnit = "kilogram";
  } else if (unit === "milliliter" && Math.abs(numeric) >= 1000) {
    displayValue = numeric / 1000;
    displayUnit = "liter";
  }

  return formatQuantityWithUnit(displayValue, displayUnit);
}

/** Amount + unit labels for stock cards (e.g. 2,4 + kg). */
export function splitDisplayQuantity(
  quantity: string | number | null | undefined,
  unit: string | null | undefined,
): { amount: string; unit: string } {
  const formatted = formatDisplayQuantityWithUnit(quantity, unit);
  if (!formatted || formatted === "—") {
    return { amount: formatted || "—", unit: "" };
  }
  const parts = formatted.split(/\s|\u00A0/);
  if (parts.length < 2) {
    return { amount: formatted, unit: "" };
  }
  const unitPart = parts[parts.length - 1] ?? "";
  const amount = parts.slice(0, -1).join("\u00A0");
  return { amount, unit: unitPart };
}

/** Suma ilości w nagłówku rodzaju (prezentacja, np. 2,4 kg). */
export function formatGroupTotalQuantity(
  items: Array<{ totalQuantity: string; defaultUnit: string }>,
): string {
  const units = new Set(items.map((item) => item.defaultUnit));
  if (units.size === 1) {
    const sum = items
      .reduce((acc, item) => acc + Number(item.totalQuantity), 0)
      .toFixed(3);
    return formatDisplayQuantityWithUnit(sum, items[0]!.defaultUnit);
  }
  return items
    .map((item) =>
      formatDisplayQuantityWithUnit(item.totalQuantity, item.defaultUnit),
    )
    .join(" · ");
}

/** Wartości odżywcze: bez zbędnych zer, kcal domyślnie bez części dziesiętnej. */
export function formatNutritionNumber(
  value: string | number | null | undefined,
  maximumFractionDigits = 1,
): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(numeric);
}

/** Grosze → `12,34 zł`. Brak wartości daje kreskę. */
export function formatMoneyMinor(
  minor: number | null | undefined,
  fallback = "—",
): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) {
    return fallback;
  }
  return `${new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)}\u00A0zł`;
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
    return `${formatQuantityNumber(packageCount)}\u00A0×\u00A0${optionName}`;
  }
  return formatQuantityWithUnit(fallbackQuantity, fallbackUnit);
}
