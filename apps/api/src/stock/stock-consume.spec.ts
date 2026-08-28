import { Prisma } from '../generated/prisma/client';

import {
  allocateConsumption,
  batchLineCostMinor,
  sortBatchesForConsumption,
  type StockBatchRow,
} from './stock-consume';

describe('stock-consume', () => {
  const now = new Date('2026-08-28T12:00:00.000Z');

  function batch(
    id: string,
    quantity: string,
    initial: string,
    priceMinor: number | null,
    opts?: { expiresAt?: string; purchasedAt?: string; createdAt?: string },
  ): StockBatchRow {
    return {
      id,
      quantity: new Prisma.Decimal(quantity),
      initialQuantity: new Prisma.Decimal(initial),
      purchasePriceMinor: priceMinor,
      expiresAt: opts?.expiresAt ? new Date(opts.expiresAt) : null,
      purchasedAt: opts?.purchasedAt ? new Date(opts.purchasedAt) : null,
      createdAt: new Date(opts?.createdAt ?? '2026-01-01T00:00:00.000Z'),
    };
  }

  it('przykład Biedronka + Carrefour: 600 g → 500 g (4 zł) + 100 g (1 zł)', () => {
    const biedronka = batch('b', '500', '500', 400, {
      expiresAt: '2026-08-30T00:00:00.000Z',
      purchasedAt: '2026-08-20T00:00:00.000Z',
    });
    const carrefour = batch('c', '1000', '1000', 1000, {
      expiresAt: '2026-09-01T00:00:00.000Z',
      purchasedAt: '2026-08-22T00:00:00.000Z',
    });

    const result = allocateConsumption(
      [carrefour, biedronka],
      new Prisma.Decimal('600'),
      now,
    );

    expect(result.insufficientQuantity).toBeNull();
    expect(result.totalCostMinor).toBe(500);
    expect(result.costComplete).toBe(true);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({
      stockItemId: 'b',
      quantity: new Prisma.Decimal('500'),
      costMinor: 400,
    });
    expect(result.lines[1]).toMatchObject({
      stockItemId: 'c',
      quantity: new Prisma.Decimal('100'),
      costMinor: 100,
    });
  });

  it('3 sztuki za 100 groszy → trzy zużycia po 1 sumują się do 100', () => {
    let remaining = batch('p', '3', '3', 100);
    const costs: number[] = [];

    for (let i = 0; i < 3; i += 1) {
      const take = new Prisma.Decimal('1');
      const cost = batchLineCostMinor(remaining, take);
      expect(cost).not.toBeNull();
      costs.push(cost!);
      remaining = {
        ...remaining,
        quantity: remaining.quantity.sub(take),
      };
    }

    expect(costs.reduce((a, b) => a + b, 0)).toBe(100);
    expect(new Set(costs).size).toBeGreaterThan(1);
  });

  it('cofnięcie i ponowne zużycie zachowują sumę groszy partii', () => {
    let remaining = batch('p', '3', '3', 100);
    const first = allocateConsumption(
      [remaining],
      new Prisma.Decimal('1'),
      now,
    );
    remaining = {
      ...remaining,
      quantity: remaining.quantity.sub(first.lines[0]!.quantity),
    };
    const second = allocateConsumption(
      [remaining],
      new Prisma.Decimal('1'),
      now,
    );
    remaining = {
      ...remaining,
      quantity: remaining.quantity.sub(second.lines[0]!.quantity),
    };
    // cofnięcie drugiego
    remaining = {
      ...remaining,
      quantity: remaining.quantity.add(second.lines[0]!.quantity),
    };
    const secondAgain = allocateConsumption(
      [remaining],
      new Prisma.Decimal('1'),
      now,
    );
    remaining = {
      ...remaining,
      quantity: remaining.quantity.sub(secondAgain.lines[0]!.quantity),
    };
    const third = allocateConsumption(
      [remaining],
      new Prisma.Decimal('1'),
      now,
    );

    const total =
      (first.totalCostMinor ?? 0) +
      (secondAgain.totalCostMinor ?? 0) +
      (third.totalCostMinor ?? 0);
    expect(total).toBe(100);
  });

  it('pomija przeterminowane partie w automatycznym doborze', () => {
    const expired = batch('e', '100', '100', 100, {
      expiresAt: '2026-08-01T00:00:00.000Z',
    });
    const fresh = batch('f', '200', '200', 200, {
      expiresAt: '2026-09-01T00:00:00.000Z',
    });
    const sorted = sortBatchesForConsumption([expired, fresh], now);
    expect(sorted.map((b) => b.id)).toEqual(['f']);
  });

  it('ręczne zużycie może odpisać przeterminowaną partię', () => {
    const expired = batch('e', '50', '50', 200, {
      expiresAt: '2026-08-01T00:00:00.000Z',
    });
    const result = allocateConsumption(
      [expired],
      new Prisma.Decimal('50'),
      now,
      [{ stockItemId: 'e', quantity: new Prisma.Decimal('50') }],
    );
    expect(result.insufficientQuantity).toBeNull();
    expect(result.totalCostMinor).toBe(200);
  });

  it('partie bez terminu idą po terminowych, od najstarszego przyjęcia', () => {
    const withExpiry = batch('a', '10', '10', 10, {
      expiresAt: '2026-09-15T00:00:00.000Z',
    });
    const olderNoExpiry = batch('b', '10', '10', 10, {
      purchasedAt: '2026-07-01T00:00:00.000Z',
    });
    const newerNoExpiry = batch('c', '10', '10', 10, {
      purchasedAt: '2026-08-01T00:00:00.000Z',
    });
    const sorted = sortBatchesForConsumption(
      [newerNoExpiry, withExpiry, olderNoExpiry],
      now,
    );
    expect(sorted.map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });

  it('brak ceny nie oznacza zera kosztu', () => {
    const noPrice = batch('n', '100', '100', null);
    expect(batchLineCostMinor(noPrice, new Prisma.Decimal('50'))).toBeNull();
    const result = allocateConsumption(
      [noPrice],
      new Prisma.Decimal('10'),
      now,
    );
    expect(result.costComplete).toBe(false);
    expect(result.totalCostMinor).toBeNull();
  });

  it('zwraca niewystarczającą ilość zamiast częściowego zużycia', () => {
    const result = allocateConsumption(
      [batch('x', '100', '100', 500)],
      new Prisma.Decimal('150'),
      now,
    );
    expect(result.insufficientQuantity?.toString()).toBe('50');
    expect(result.lines).toHaveLength(0);
  });

  it('prawdziwe zero ceny to zero kosztu', () => {
    const free = batch('z', '100', '100', 0);
    expect(batchLineCostMinor(free, new Prisma.Decimal('10'))).toBe(0);
  });

  it('zmiana ręcznego podziału zmienia fingerprint', () => {
    const a = batch('a', '100', '100', 100);
    const b = batch('b', '100', '100', 100);
    const auto = allocateConsumption([a, b], new Prisma.Decimal('50'), now);
    const manual = allocateConsumption([a, b], new Prisma.Decimal('50'), now, [
      { stockItemId: 'b', quantity: new Prisma.Decimal('50') },
    ]);
    expect(auto.fingerprint).not.toBe(manual.fingerprint);
  });
});
