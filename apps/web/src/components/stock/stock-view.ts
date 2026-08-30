export const STOCK_VIEWS = ["stock", "catalog", "history"] as const;

export type StockView = (typeof STOCK_VIEWS)[number];

export function parseStockView(value: string | null | undefined): StockView {
  if (value === "catalog" || value === "history") {
    return value;
  }
  return "stock";
}

export function stockViewHref(kitchenId: string, view: StockView): string {
  const base = `/kitchens/${kitchenId}/stock`;
  if (view === "stock") {
    return base;
  }
  return `${base}?view=${view}`;
}

export function newPurchaseHref(kitchenId: string): string {
  return `/kitchens/${kitchenId}/products/new?mode=purchase&stock=1&from=stock`;
}

export function newCatalogProductHref(kitchenId: string): string {
  return `/kitchens/${kitchenId}/products/new?mode=catalog&stock=0&from=catalog`;
}
