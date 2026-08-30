import type { components } from '@moja-kuchnia/api-client';

export type StockProductListItem =
  components['schemas']['StockProductListItemDto'];

export type StockProductRow = components['schemas']['StockProductRowDto'];
export type StockGroupRow = components['schemas']['StockGroupListItemDto'];

/** OpenAPI marks items as product rows only; runtime also returns groups. */
export type StockPageEntry = StockProductRow | StockGroupRow;

export type StockSummaryPage = Omit<
  components['schemas']['StockSummaryPageDto'],
  'items'
> & {
  items: StockPageEntry[];
};

export function asStockSummaryPage(data: unknown): StockSummaryPage {
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as StockSummaryPage).items)
  ) {
    return data as StockSummaryPage;
  }
  if (Array.isArray(data)) {
    const products = data as StockProductListItem[];
    return {
      items: products.map((product) => ({
        kind: 'product' as const,
        product,
      })),
      page: 1,
      limit: products.length || 100,
      total: products.length,
      pageCount: products.length === 0 ? 0 : 1,
    };
  }
  return { items: [], page: 1, limit: 100, total: 0, pageCount: 0 };
}

export function flattenStockProducts(
  page: StockSummaryPage,
): StockProductListItem[] {
  const out: StockProductListItem[] = [];
  for (const entry of page.items) {
    if (entry.kind === 'product') {
      out.push(entry.product);
    } else {
      out.push(...entry.variants);
    }
  }
  return out;
}

export function findStockProduct(
  page: StockSummaryPage,
  productId: string,
): StockProductListItem | undefined {
  return flattenStockProducts(page).find(
    (item) => item.productId === productId,
  );
}
