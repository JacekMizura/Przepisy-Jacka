export type PurchaseModeChoice = "packaged" | "exact";

export function coercePurchaseModeChoice(
  mode: string | null | undefined,
  hasPackage: boolean,
): PurchaseModeChoice | null {
  if (mode === "packaged" || mode === "exact") {
    return mode;
  }
  if (hasPackage) {
    return "packaged";
  }
  if (mode === "unconfigured") {
    return null;
  }
  return null;
}

/** Opakowanie ma sens wyłącznie w trybie „W opakowaniach”. */
export function showsProductPackageSize(
  purchaseMode: string | null | undefined,
): boolean {
  return purchaseMode === "packaged";
}

/**
 * Etykieta wielkości opakowania SKU — null dla luzem / braku danych.
 * Nie używa wartości nutrition (np. 100 g).
 */
export function formatProductPackageSizeLabel(args: {
  purchaseMode: string | null | undefined;
  packageQuantity: string | null | undefined;
  packageUnitLabel: string | null | undefined;
}): string | null {
  if (!showsProductPackageSize(args.purchaseMode)) {
    return null;
  }
  const qty = args.packageQuantity?.trim();
  const unit = args.packageUnitLabel?.trim();
  if (!qty || !unit) {
    return null;
  }
  return `${qty}\u00A0${unit} w opakowaniu`;
}

/** Pola opakowania przy zapisie: dla exact zawsze null. */
export function packageFieldsForPurchaseMode(args: {
  purchaseMode: PurchaseModeChoice | null;
  packageQuantity: string;
  packageUnit: string | null | undefined;
}):
  | { packageQuantity: string | null; packageUnit: string | null }
  | "incomplete" {
  if (args.purchaseMode === "exact") {
    return { packageQuantity: null, packageUnit: null };
  }
  const qty = args.packageQuantity.trim();
  const unit = args.packageUnit?.trim() || "";
  if (!qty && !unit) {
    return { packageQuantity: null, packageUnit: null };
  }
  if (!qty || !unit) {
    return "incomplete";
  }
  return { packageQuantity: qty, packageUnit: unit };
}
