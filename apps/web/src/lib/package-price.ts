/** Parsowanie ceny opakowania i mnożenie w groszach (integer). */

/** Dodatnia liczba całkowita opakowań. */
export function parsePositivePackageCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    return null;
  }
  return value;
}

/**
 * Łączna cena partii w groszach = cena opakowania × liczba (integer, bez Float).
 */
export function totalPriceMinorFromPackages(
  packagePriceMinor: number,
  packageCount: number,
): number | null {
  if (
    !Number.isInteger(packagePriceMinor) ||
    packagePriceMinor < 0 ||
    !Number.isSafeInteger(packagePriceMinor)
  ) {
    return null;
  }
  if (
    !Number.isInteger(packageCount) ||
    packageCount < 1 ||
    !Number.isSafeInteger(packageCount)
  ) {
    return null;
  }
  const total = packagePriceMinor * packageCount;
  return Number.isSafeInteger(total) ? total : null;
}

/** Cena za opakowanie z pola tekstowego → grosze; null przy błędzie. */
export function packagePriceMinorFromInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const [wholePart, frac = ""] = normalized.split(".");
  const whole = wholePart ?? "0";
  const fracPadded = `${frac}00`.slice(0, 2);
  const minor =
    Number.parseInt(whole, 10) * 100 + Number.parseInt(fracPadded, 10);
  return Number.isSafeInteger(minor) ? minor : null;
}
