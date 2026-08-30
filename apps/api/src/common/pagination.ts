/** Pure pagination helpers (no Nest decorators — safe for unit tests). */

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;

export type PaginatedMeta = {
  page: number;
  limit: number;
  total: number;
  pageCount: number;
};

export function normalizePagination(input: { page?: number; limit?: number }): {
  page: number;
  limit: number;
  skip: number;
} {
  const page =
    Number.isFinite(input.page) && (input.page ?? 0) >= 1
      ? Math.floor(input.page as number)
      : 1;
  const rawLimit =
    Number.isFinite(input.limit) && (input.limit ?? 0) >= 1
      ? Math.floor(input.limit as number)
      : DEFAULT_LIST_LIMIT;
  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, rawLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function buildPaginatedMeta(
  total: number,
  page: number,
  limit: number,
): PaginatedMeta {
  const pageCount = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    pageCount,
  };
}

export function slicePage<T>(items: T[], page: number, limit: number): T[] {
  const start = (page - 1) * limit;
  return items.slice(start, start + limit);
}
