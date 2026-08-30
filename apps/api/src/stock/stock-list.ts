import { Prisma } from '../generated/prisma/client';
import { ProductUnit, StorageLocation } from '../generated/prisma/client';

import {
  buildPaginatedMeta,
  normalizePagination,
  slicePage,
} from '../common/pagination';
import type {
  ExpiryStatusFilter,
  StockGroupListItemDto,
  StockProductListItemDto,
  StockProductRowDto,
  StockSort,
  StockSummaryPageDto,
} from './dto/stock-list-query.dto';

const EXPIRING_MS = 7 * 86400000;

export type StockListProductAggregate = {
  productId: string;
  productName: string;
  defaultUnit: ProductUnit;
  category: string | null;
  isArchived: boolean;
  brand: string | null;
  variantLabel: string | null;
  groupId: string | null;
  groupName: string | null;
  imageUrl: string | null;
  totalQuantity: Prisma.Decimal;
  batchCount: number;
  expiringBatchCount: number;
  nearestExpiry: Date | null;
  primaryLocation: StorageLocation | null;
  latestBatchAt: Date;
  batches: StockProductListItemDto['batches'];
};

export function expiryBucket(
  nearestExpiry: Date | null,
  now: Date,
): 'expired' | 'expiring' | 'ok' | 'none' {
  if (!nearestExpiry) {
    return 'none';
  }
  if (nearestExpiry.getTime() <= now.getTime()) {
    return 'expired';
  }
  if (nearestExpiry.getTime() <= now.getTime() + EXPIRING_MS) {
    return 'expiring';
  }
  return 'ok';
}

export function matchesExpiryStatus(
  nearestExpiry: Date | null,
  now: Date,
  status: ExpiryStatusFilter | undefined,
): boolean {
  if (!status || status === 'any') {
    return true;
  }
  return expiryBucket(nearestExpiry, now) === status;
}

function toListItem(agg: StockListProductAggregate): StockProductListItemDto {
  return {
    productId: agg.productId,
    productName: agg.productName,
    defaultUnit: agg.defaultUnit,
    category: agg.category,
    isArchived: agg.isArchived,
    totalQuantity: agg.totalQuantity.toFixed(3),
    batchCount: agg.batchCount,
    expiringBatchCount: agg.expiringBatchCount,
    nearestExpiry: agg.nearestExpiry ? agg.nearestExpiry.toISOString() : null,
    batches: agg.batches,
    brand: agg.brand,
    variantLabel: agg.variantLabel,
    groupId: agg.groupId,
    groupName: agg.groupName,
    imageUrl: agg.imageUrl,
    primaryLocation: agg.primaryLocation,
    latestBatchAt: agg.latestBatchAt.toISOString(),
  };
}

export type StockListEntry = StockProductRowDto | StockGroupListItemDto;

export function buildStockListEntries(
  aggregates: StockListProductAggregate[],
): StockListEntry[] {
  const byGroup = new Map<string, StockListProductAggregate[]>();
  const singles: StockListProductAggregate[] = [];

  for (const agg of aggregates) {
    if (!agg.groupId) {
      singles.push(agg);
      continue;
    }
    const list = byGroup.get(agg.groupId) ?? [];
    list.push(agg);
    byGroup.set(agg.groupId, list);
  }

  const entries: StockListEntry[] = [];

  for (const agg of singles) {
    entries.push({ kind: 'product', product: toListItem(agg) });
  }

  for (const [, variants] of byGroup) {
    if (variants.length === 1) {
      const only = variants[0]!;
      entries.push({
        kind: 'product',
        product: {
          ...toListItem(only),
          // zachowaj groupName jako etykietę rodzaju
        },
      });
      continue;
    }

    let total = new Prisma.Decimal(0);
    let batchCount = 0;
    let expiringBatchCount = 0;
    let nearestExpiry: Date | null = null;
    let primaryLocation: StorageLocation | null = null;
    const unitCounts = new Map<ProductUnit, number>();

    for (const v of variants) {
      total = total.add(v.totalQuantity);
      batchCount += v.batchCount;
      expiringBatchCount += v.expiringBatchCount;
      unitCounts.set(v.defaultUnit, (unitCounts.get(v.defaultUnit) ?? 0) + 1);
      if (v.nearestExpiry) {
        if (!nearestExpiry || v.nearestExpiry < nearestExpiry) {
          nearestExpiry = v.nearestExpiry;
        }
      }
      if (!primaryLocation && v.primaryLocation) {
        primaryLocation = v.primaryLocation;
      }
    }

    let defaultUnit: ProductUnit = variants[0]!.defaultUnit;
    let best = 0;
    for (const [unit, count] of unitCounts) {
      if (count > best) {
        best = count;
        defaultUnit = unit;
      }
    }

    const first = variants[0]!;
    entries.push({
      kind: 'group',
      groupId: first.groupId!,
      groupName: first.groupName ?? 'Rodzaj',
      variantCount: variants.length,
      batchCount,
      totalQuantity: total.toFixed(3),
      defaultUnit,
      nearestExpiry: nearestExpiry ? nearestExpiry.toISOString() : null,
      expiringBatchCount,
      primaryLocation,
      variants: variants
        .map(toListItem)
        .sort((a, b) => a.productName.localeCompare(b.productName, 'pl')),
    });
  }

  return entries;
}

function entrySortKeyExpiry(
  entry: StockListEntry,
  now: Date,
): [number, string] {
  const nearest =
    entry.kind === 'group' ? entry.nearestExpiry : entry.product.nearestExpiry;
  const bucket = expiryBucket(nearest ? new Date(nearest) : null, now);
  const rank = bucket === 'expired' ? 0 : bucket === 'expiring' ? 1 : 2;
  const name =
    entry.kind === 'group' ? entry.groupName : entry.product.productName;
  return [rank, name];
}

export function sortStockListEntries(
  entries: StockListEntry[],
  sort: StockSort | undefined,
  now: Date,
): StockListEntry[] {
  const mode = sort ?? 'expiry';
  const copy = [...entries];

  copy.sort((a, b) => {
    if (mode === 'name') {
      const an = a.kind === 'group' ? a.groupName : a.product.productName;
      const bn = b.kind === 'group' ? b.groupName : b.product.productName;
      return an.localeCompare(bn, 'pl');
    }
    if (mode === 'newest') {
      const at =
        a.kind === 'group'
          ? Math.max(
              ...a.variants.map((v) => new Date(v.latestBatchAt).getTime()),
            )
          : new Date(a.product.latestBatchAt).getTime();
      const bt =
        b.kind === 'group'
          ? Math.max(
              ...b.variants.map((v) => new Date(v.latestBatchAt).getTime()),
            )
          : new Date(b.product.latestBatchAt).getTime();
      return bt - at;
    }
    if (mode === 'qty_desc' || mode === 'qty_asc') {
      const aq = Number(
        a.kind === 'group' ? a.totalQuantity : a.product.totalQuantity,
      );
      const bq = Number(
        b.kind === 'group' ? b.totalQuantity : b.product.totalQuantity,
      );
      return mode === 'qty_desc' ? bq - aq : aq - bq;
    }
    // expiry (default)
    const [ar, an] = entrySortKeyExpiry(a, now);
    const [br, bn] = entrySortKeyExpiry(b, now);
    if (ar !== br) {
      return ar - br;
    }
    return an.localeCompare(bn, 'pl');
  });

  return copy;
}

export function paginateStockListEntries(
  entries: StockListEntry[],
  pageInput?: number,
  limitInput?: number,
): StockSummaryPageDto {
  const { page, limit } = normalizePagination({
    page: pageInput,
    limit: limitInput,
  });
  const total = entries.length;
  const items = slicePage(entries, page, limit);
  return {
    items,
    ...buildPaginatedMeta(total, page, limit),
  };
}
