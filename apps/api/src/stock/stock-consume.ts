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
 * Koszt części partii z rozliczeniem narastającym:
 * round(P × takenAfter / Q) − round(P × takenBefore / Q),
 * gdzie takenBefore = initialQuantity − remainingBeforeTake.
 * Dzięki temu kolejne częściowe zużycia sumują się dokładnie do ceny zakupu.
 */
export function batchLineCostMinor(
  batch: Pick<
    StockBatchRow,
    'initialQuantity' | 'purchasePriceMinor' | 'quantity'
  >,
  takeQuantity: Prisma.Decimal,
): number | null {
  if (
    batch.purchasePriceMinor === null ||
    batch.purchasePriceMinor === undefined
  ) {
    return null;
  }
  if (batch.initialQuantity.lte(0) || takeQuantity.lte(0)) {
    return null;
  }
  const takenBefore = batch.initialQuantity.sub(batch.quantity);
  const takenAfter = takenBefore.add(takeQuantity);
  const costAfter = new Prisma.Decimal(batch.purchasePriceMinor)
    .mul(takenAfter)
    .div(batch.initialQuantity)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
  const costBefore = new Prisma.Decimal(batch.purchasePriceMinor)
    .mul(takenBefore)
    .div(batch.initialQuantity)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
  return costAfter - costBefore;
}

function mergeManualLines(
  manualLines: Array<{ stockItemId: string; quantity: Prisma.Decimal }>,
): Array<{ stockItemId: string; quantity: Prisma.Decimal }> {
  const merged = new Map<string, Prisma.Decimal>();
  for (const line of manualLines) {
    if (line.quantity.lte(0)) {
      throw new BadRequestException(
        'Każda ręczna linia zużycia musi mieć ilość większą od zera.',
      );
    }
    const prev = merged.get(line.stockItemId) ?? new Prisma.Decimal(0);
    merged.set(line.stockItemId, prev.add(line.quantity));
  }
  return Array.from(merged.entries()).map(([stockItemId, quantity]) => ({
    stockItemId,
    quantity,
  }));
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

  const working = new Map(
    batches.map((b) => [
      b.id,
      {
        ...b,
        quantity: new Prisma.Decimal(b.quantity),
      },
    ]),
  );
  const lines: ConsumeAllocationLine[] = [];

  if (manualLines && manualLines.length > 0) {
    const merged = mergeManualLines(manualLines);
    let manualTotal = new Prisma.Decimal(0);
    for (const manual of merged) {
      const batch = working.get(manual.stockItemId);
      if (!batch) {
        throw new BadRequestException('Nie znaleziono partii w tej kuchni.');
      }
      if (batch.quantity.lt(manual.quantity)) {
        throw new BadRequestException(
          'Niewystarczająca ilość w wybranej partii.',
        );
      }
      // Przeterminowane dozwolone wyłącznie w ręcznym wyborze (jawny odpis).
      manualTotal = manualTotal.add(manual.quantity);
      lines.push({
        stockItemId: manual.stockItemId,
        quantity: manual.quantity,
        costMinor: batchLineCostMinor(batch, manual.quantity),
      });
      batch.quantity = batch.quantity.sub(manual.quantity);
    }
    if (!manualTotal.eq(requestedQuantity)) {
      throw new BadRequestException(
        'Suma ręcznych linii musi równać się żądanej ilości do zużycia.',
      );
    }
  } else {
    const sorted = sortBatchesForConsumption(batches, now);
    let remaining = requestedQuantity;
    for (const sortedBatch of sorted) {
      if (remaining.lte(0)) break;
      const batch = working.get(sortedBatch.id);
      if (!batch) continue;
      const take = Prisma.Decimal.min(batch.quantity, remaining);
      if (take.lte(0)) continue;
      lines.push({
        stockItemId: batch.id,
        quantity: take,
        costMinor: batchLineCostMinor(batch, take),
      });
      batch.quantity = batch.quantity.sub(take);
      remaining = remaining.sub(take);
    }
    if (remaining.gt(0)) {
      return {
        lines: [],
        totalQuantity: new Prisma.Decimal(0),
        totalCostMinor: null,
        costComplete: false,
        fingerprint: buildPreviewFingerprint(batches, []),
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
    fingerprint: buildPreviewFingerprint(batches, lines),
    insufficientQuantity: null,
  };
}

/** Odcisk stanu partii + zaproponowanego podziału (zmiana wyboru wymaga odświeżenia). */
export function buildPreviewFingerprint(
  batches: StockBatchRow[],
  lines: Array<{ stockItemId: string; quantity: Prisma.Decimal }>,
): string {
  const batchPart = [...batches]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((b) => `${b.id}:${b.quantity.toFixed(3)}`)
    .join('|');
  const linePart = [...lines]
    .sort((a, b) => a.stockItemId.localeCompare(b.stockItemId))
    .map((l) => `${l.stockItemId}:${l.quantity.toFixed(3)}`)
    .join('|');
  return createHash('sha256')
    .update(`${batchPart}##${linePart}`)
    .digest('hex')
    .slice(0, 16);
}

/** @deprecated Użyj buildPreviewFingerprint — zachowane dla kompatybilności wywołań. */
export function buildFingerprint(batches: StockBatchRow[]): string {
  return buildPreviewFingerprint(batches, []);
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

/** Powód blokady fizycznego usunięcia partii; null = wolno usunąć. */
export function stockItemDeleteBlockReason(input: {
  hasPurchaseLink: boolean;
  consumptionLineCount: number;
}): string | null {
  if (input.hasPurchaseLink) {
    return 'Partia pochodzi z zakupu lub paragonu — nie można jej usunąć. Użyj „Odpisz”, aby wyzerować zapas z zapisem w historii.';
  }
  if (input.consumptionLineCount > 0) {
    return 'Partia ma historię zużycia — nie można jej usunąć. Użyj „Odpisz”, aby skorygować pozostałą ilość.';
  }
  return null;
}
