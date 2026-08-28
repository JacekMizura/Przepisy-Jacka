import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

export type StockBatchRow = {
  id: string;
  quantity: Prisma.Decimal;
  initialQuantity: Prisma.Decimal;
  purchasePriceMinor: number | null;
  expiresAt: Date | null;
  purchasedAt: Date | null;
  createdAt: Date;
};

export type ConsumeAllocationLine = {
  stockItemId: string;
  quantity: Prisma.Decimal;
  costMinor: number | null;
};

export type ConsumeAllocationResult = {
  lines: ConsumeAllocationLine[];
  totalQuantity: Prisma.Decimal;
  totalCostMinor: number | null;
  costComplete: boolean;
  fingerprint: string;
  insufficientQuantity: Prisma.Decimal | null;
};

/** Kolejność FIFO: termin ważności → brak terminu po dacie przyjęcia → id. */
export function sortBatchesForConsumption(
  batches: StockBatchRow[],
  now: Date,
): StockBatchRow[] {
  const eligible = batches.filter(
    (b) => b.quantity.gt(0) && (b.expiresAt === null || b.expiresAt > now),
  );

  return [...eligible].sort((a, b) => {
    const aHasExpiry = a.expiresAt !== null;
    const bHasExpiry = b.expiresAt !== null;
    if (aHasExpiry && bHasExpiry) {
      const diff = a.expiresAt!.getTime() - b.expiresAt!.getTime();
      if (diff !== 0) return diff;
    } else if (aHasExpiry !== bHasExpiry) {
      return aHasExpiry ? -1 : 1;
    }

    const aReceived = (a.purchasedAt ?? a.createdAt).getTime();
    const bReceived = (b.purchasedAt ?? b.createdAt).getTime();
    if (aReceived !== bReceived) {
      return aReceived - bReceived;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Koszt części partii: oryginalna cena / oryginalna ilość × zużyta ilość.
 * Zaokrąglenie do pełnych groszy (half-up).
 */
export function batchLineCostMinor(
  batch: Pick<StockBatchRow, 'initialQuantity' | 'purchasePriceMinor'>,
  quantity: Prisma.Decimal,
): number | null {
  if (
    batch.purchasePriceMinor === null ||
    batch.purchasePriceMinor === undefined
  ) {
    return null;
  }
  if (batch.initialQuantity.lte(0)) {
    return null;
  }
  const raw = quantity.mul(batch.purchasePriceMinor).div(batch.initialQuantity);
  return raw.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function allocateConsumption(
  batches: StockBatchRow[],
  requestedQuantity: Prisma.Decimal,
  now: Date,
  manualLines?: Array<{ stockItemId: string; quantity: Prisma.Decimal }>,
): ConsumeAllocationResult {
  if (requestedQuantity.lte(0)) {
    throw new BadRequestException('Ilość do zużycia musi być większa od zera.');
  }

  const batchById = new Map(batches.map((b) => [b.id, b]));
  const lines: ConsumeAllocationLine[] = [];

  if (manualLines && manualLines.length > 0) {
    let manualTotal = new Prisma.Decimal(0);
    for (const manual of manualLines) {
      if (manual.quantity.lte(0)) {
        throw new BadRequestException(
          'Każda ręczna linia zużycia musi mieć ilość większą od zera.',
        );
      }
      const batch = batchById.get(manual.stockItemId);
      if (!batch) {
        throw new BadRequestException('Nie znaleziono partii w tej kuchni.');
      }
      if (batch.quantity.lt(manual.quantity)) {
        throw new BadRequestException(
          `Niewystarczająca ilość w partii ${manual.stockItemId}.`,
        );
      }
      if (batch.expiresAt !== null && batch.expiresAt <= now) {
        throw new BadRequestException(
          'Przeterminowane partie nie mogą być użyte w ręcznym podziale.',
        );
      }
      manualTotal = manualTotal.add(manual.quantity);
      lines.push({
        stockItemId: manual.stockItemId,
        quantity: manual.quantity,
        costMinor: batchLineCostMinor(batch, manual.quantity),
      });
    }
    if (!manualTotal.eq(requestedQuantity)) {
      throw new BadRequestException(
        'Suma ręcznych linii musi równać się żądanej ilości do zużycia.',
      );
    }
  } else {
    const sorted = sortBatchesForConsumption(batches, now);
    let remaining = requestedQuantity;
    for (const batch of sorted) {
      if (remaining.lte(0)) break;
      const take = Prisma.Decimal.min(batch.quantity, remaining);
      if (take.lte(0)) continue;
      lines.push({
        stockItemId: batch.id,
        quantity: take,
        costMinor: batchLineCostMinor(batch, take),
      });
      remaining = remaining.sub(take);
    }
    if (remaining.gt(0)) {
      return {
        lines: [],
        totalQuantity: new Prisma.Decimal(0),
        totalCostMinor: null,
        costComplete: false,
        fingerprint: buildFingerprint(batches),
        insufficientQuantity: remaining,
      };
    }
  }

  let totalCostMinor = 0;
  let costComplete = true;
  for (const line of lines) {
    if (line.costMinor === null) {
      costComplete = false;
    } else {
      totalCostMinor += line.costMinor;
    }
  }

  const totalQuantity = lines.reduce(
    (sum, line) => sum.add(line.quantity),
    new Prisma.Decimal(0),
  );

  return {
    lines,
    totalQuantity,
    totalCostMinor: costComplete ? totalCostMinor : null,
    costComplete,
    fingerprint: buildFingerprint(batches),
    insufficientQuantity: null,
  };
}

export function buildFingerprint(batches: StockBatchRow[]): string {
  const payload = [...batches]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((b) => `${b.id}:${b.quantity.toFixed(3)}`)
    .join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function unitPriceMinor(
  initialQuantity: Prisma.Decimal,
  purchasePriceMinor: number | null,
): number | null {
  if (purchasePriceMinor === null || initialQuantity.lte(0)) {
    return null;
  }
  const raw = new Prisma.Decimal(purchasePriceMinor).div(initialQuantity);
  return raw.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}
