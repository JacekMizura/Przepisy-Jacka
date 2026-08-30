import {
  buildPaginatedMeta,
  normalizePagination,
  slicePage,
  MAX_LIST_LIMIT,
} from './pagination';

describe('pagination helpers', () => {
  it('clamps limit to max 100 and defaults page/limit', () => {
    expect(normalizePagination({})).toEqual({
      page: 1,
      limit: 50,
      skip: 0,
    });
    expect(normalizePagination({ limit: 500 }).limit).toBe(MAX_LIST_LIMIT);
    expect(normalizePagination({ page: 3, limit: 25 }).skip).toBe(50);
  });

  it('builds pageCount from total', () => {
    expect(buildPaginatedMeta(0, 1, 50)).toEqual({
      page: 1,
      limit: 50,
      total: 0,
      pageCount: 0,
    });
    expect(buildPaginatedMeta(101, 1, 50).pageCount).toBe(3);
  });

  it('slices the current page only', () => {
    const items = [1, 2, 3, 4, 5];
    expect(slicePage(items, 1, 2)).toEqual([1, 2]);
    expect(slicePage(items, 3, 2)).toEqual([5]);
  });
});
