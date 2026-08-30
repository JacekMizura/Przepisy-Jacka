import { Prisma } from '../generated/prisma/client';

import {
  buildStockListEntries,
  matchesExpiryStatus,
  paginateStockListEntries,
  sortStockListEntries,
  type StockListProductAggregate,
} from './stock-list';

function agg(
  partial: Partial<StockListProductAggregate> &
    Pick<StockListProductAggregate, 'productId' | 'productName'>,
): StockListProductAggregate {
  return {
    defaultUnit: 'gram',
    category: null,
    isArchived: false,
    brand: null,
    variantLabel: null,
    groupId: null,
    groupName: null,
    imageUrl: null,
    totalQuantity: new Prisma.Decimal(100),
    batchCount: 1,
    expiringBatchCount: 0,
    nearestExpiry: null,
    primaryLocation: 'pantry',
    latestBatchAt: new Date('2026-08-01T00:00:00.000Z'),
    batches: [],
    ...partial,
  };
}

describe('stock-list', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');

  it('collapses multi-variant groups and keeps single-variant as product', () => {
    const entries = buildStockListEntries([
      agg({
        productId: 'a',
        productName: 'Koktajlowe',
        groupId: 'g1',
        groupName: 'Pomidory',
        totalQuantity: new Prisma.Decimal(400),
      }),
      agg({
        productId: 'b',
        productName: 'Malinowe',
        groupId: 'g1',
        groupName: 'Pomidory',
        totalQuantity: new Prisma.Decimal(2000),
      }),
      agg({
        productId: 'c',
        productName: 'Mozzarella',
        groupId: 'g2',
        groupName: 'Mozzarella',
        totalQuantity: new Prisma.Decimal(250),
      }),
    ]);

    expect(entries).toHaveLength(2);
    const group = entries.find((e) => e.kind === 'group');
    const product = entries.find((e) => e.kind === 'product');
    expect(group && group.kind === 'group').toBe(true);
    if (group?.kind === 'group') {
      expect(group.variantCount).toBe(2);
      expect(group.totalQuantity).toBe('2400.000');
    }
    expect(product && product.kind === 'product').toBe(true);
    if (product?.kind === 'product') {
      expect(product.product.productName).toBe('Mozzarella');
      expect(product.product.groupName).toBe('Mozzarella');
    }
  });

  it('default expiry sort puts expired before expiring before rest', () => {
    const entries = buildStockListEntries([
      agg({
        productId: 'ok',
        productName: 'Banan',
        nearestExpiry: new Date('2026-09-20T00:00:00.000Z'),
      }),
      agg({
        productId: 'exp',
        productName: 'Jogurt',
        nearestExpiry: new Date('2026-08-20T00:00:00.000Z'),
      }),
      agg({
        productId: 'soon',
        productName: 'Mleko',
        nearestExpiry: new Date('2026-09-02T00:00:00.000Z'),
      }),
    ]);
    const sorted = sortStockListEntries(entries, 'expiry', now);
    expect(
      sorted.map((e) =>
        e.kind === 'product' ? e.product.productName : e.groupName,
      ),
    ).toEqual(['Jogurt', 'Mleko', 'Banan']);
  });

  it('paginates after grouping', () => {
    const aggregates = Array.from({ length: 5 }, (_, i) =>
      agg({
        productId: `p${i}`,
        productName: `Produkt ${i}`,
      }),
    );
    const entries = sortStockListEntries(
      buildStockListEntries(aggregates),
      'name',
      now,
    );
    const page = paginateStockListEntries(entries, 2, 2);
    expect(page.total).toBe(5);
    expect(page.pageCount).toBe(3);
    expect(page.items).toHaveLength(2);
    expect(page.page).toBe(2);
    expect(page.limit).toBe(2);
  });

  it('expiry status filter ignores unrelated buckets', () => {
    expect(
      matchesExpiryStatus(new Date('2026-08-20T00:00:00.000Z'), now, 'expired'),
    ).toBe(true);
    expect(
      matchesExpiryStatus(new Date('2026-09-20T00:00:00.000Z'), now, 'expired'),
    ).toBe(false);
    expect(matchesExpiryStatus(null, now, 'none')).toBe(true);
  });
});
