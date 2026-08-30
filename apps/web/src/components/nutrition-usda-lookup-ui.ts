/** Stałe i helpery UI lookupu USDA — bez React (testowalne w node:test). */
export const usdaLookupUi = {
  buttonLabel: "Znajdź produkt bez EAN",
  applyLabel: "Użyj tych wartości",
  sourceNote: "USDA — wartości referencyjne",
} as const;

export function usdaVariantStateLabel(variantLabel: string): string | null {
  const v = variantLabel.trim();
  if (!v) return null;
  const first = v.split(",")[0]?.trim();
  return first || v;
}
