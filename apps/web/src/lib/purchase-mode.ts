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
