/** Wspólne sugestie sklepów (UI) — zapis nadal jako StockItem.storeName / Purchase.storeName. */
export const SUGGESTED_STORE_NAMES = [
  "Carrefour",
  "Lidl",
  "Biedronka",
  "Putka",
  "Wierzejki",
] as const;

export const OTHER_STORE_VALUE = "__other__";

export const OTHER_STORE_LABEL = "Inny sklep…";

export function filterSuggestedStores(query: string): string[] {
  const q = query.trim().toLocaleLowerCase("pl");
  if (!q) {
    return [...SUGGESTED_STORE_NAMES];
  }
  return SUGGESTED_STORE_NAMES.filter((name) =>
    name.toLocaleLowerCase("pl").includes(q),
  );
}
