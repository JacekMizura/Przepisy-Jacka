import type { components } from '@moja-kuchnia/api-client';

type LegacyStockSummary = components['schemas']['StockProductSummaryDto'];

export type StockProductListItem = LegacyStockSummary & {
  brand?: string | null;
  variantLabel?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  imageUrl?: string | null;
  primaryLocation?: LegacyStockSummary['batches'][number]['location'] | null;
  latestBatchAt?: string;
};

type StockPageEntry =
  | { kind: 'product'; product: StockProductListItem }
  | {
      kind: 'group';
      groupId: string;
      groupName: string;
      variants: StockProductListItem[];
    };

export type StockSummaryPage = {
  items: StockPageEntry[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
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
      items: products.map((product) => ({ kind: 'product' as const, product })),
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
