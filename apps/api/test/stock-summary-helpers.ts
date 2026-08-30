type StockProductLike = {
  productId: string;
  [key: string]: unknown;
};

type StockPageLike = {
  items?: Array<
    | { kind: 'product'; product: StockProductLike }
    | { kind: 'group'; variants: StockProductLike[] }
  >;
  page?: number;
  limit?: number;
  total?: number;
  pageCount?: number;
};

/** Normalizuje odpowiedź stock-summary (strona lub legacy tablica). */
export function flattenStockSummaryBody(body: unknown): StockProductLike[] {
  if (Array.isArray(body)) {
    return body as StockProductLike[];
  }
  const page = body as StockPageLike;
  const out: StockProductLike[] = [];
  for (const item of page.items ?? []) {
    if (item.kind === 'product') {
      out.push(item.product);
    } else if (item.kind === 'group') {
      out.push(...item.variants);
    }
  }
  return out;
}

export function asStockSummaryPage(body: unknown): Required<StockPageLike> {
  if (Array.isArray(body)) {
    const items = (body as StockProductLike[]).map((product) => ({
      kind: 'product' as const,
      product,
    }));
    return {
      items,
      page: 1,
      limit: items.length || 50,
      total: items.length,
      pageCount: items.length === 0 ? 0 : 1,
    };
  }
  const page = body as StockPageLike;
  return {
    items: page.items ?? [],
    page: page.page ?? 1,
    limit: page.limit ?? 50,
    total: page.total ?? 0,
    pageCount: page.pageCount ?? 0,
  };
}
