/**
 * Local mirrors of paginated stock/catalog DTOs until OpenAPI + api-client
 * are regenerated. Prefer `components["schemas"][...]` once available.
 */

import type { components } from "@moja-kuchnia/api-client";

type StockSummary = components["schemas"]["StockProductSummaryDto"];
type CatalogProduct = components["schemas"]["CatalogProductDto"];
type StorageLocation = components["schemas"]["StockBatchDetailDto"]["location"];
type ProductUnit = StockSummary["defaultUnit"];

export type StockSort = "expiry" | "newest" | "name" | "qty_desc" | "qty_asc";
export type CatalogSort = "name" | "newest" | "updated" | "has_stock";
export type ExpiryStatusFilter = "any" | "expired" | "expiring" | "ok" | "none";
export type ArchivedFilter = "active" | "archived" | "all";

export type StockProductListItem = StockSummary & {
  brand: string | null;
  variantLabel: string | null;
  groupId: string | null;
  groupName: string | null;
  imageUrl: string | null;
  primaryLocation: StorageLocation | null;
  latestBatchAt: string;
};

export type StockProductRow = {
  kind: "product";
  product: StockProductListItem;
};

export type StockGroupListItem = {
  kind: "group";
  groupId: string;
  groupName: string;
  variantCount: number;
  batchCount: number;
  totalQuantity: string;
  defaultUnit: ProductUnit;
  nearestExpiry: string | null;
  expiringBatchCount: number;
  primaryLocation: StorageLocation | null;
  variants: StockProductListItem[];
};

export type StockListEntry = StockProductRow | StockGroupListItem;

export type StockSummaryPage = {
  items: StockListEntry[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
};

export type CatalogProductRow = {
  kind: "product";
  product: CatalogProduct;
  groupName: string | null;
};

export type CatalogGroupRow = {
  kind: "group";
  groupId: string;
  groupName: string;
  variantCount: number;
  batchCount: number;
  totalQuantity: string;
  defaultUnit: ProductUnit;
  variants: CatalogProduct[];
};

export type CatalogListEntry = CatalogProductRow | CatalogGroupRow;

export type CatalogPage = {
  items: CatalogListEntry[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
};

/** Flatten page entries to product rows (including group variants). */
export function flattenStockProducts(
  items: StockListEntry[],
): StockProductListItem[] {
  const out: StockProductListItem[] = [];
  for (const entry of items) {
    if (entry.kind === "product") {
      out.push(entry.product);
    } else {
      out.push(...entry.variants);
    }
  }
  return out;
}

export function findStockProduct(
  items: StockListEntry[],
  productId: string,
): StockProductListItem | null {
  for (const entry of items) {
    if (entry.kind === "product") {
      if (entry.product.productId === productId) {
        return entry.product;
      }
    } else {
      const found = entry.variants.find((v) => v.productId === productId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function isStockSummaryPage(value: unknown): value is StockSummaryPage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.items) && typeof record.page === "number";
}

export function asStockSummaryPage(data: unknown): StockSummaryPage {
  if (isStockSummaryPage(data)) {
    return data;
  }
  // Legacy array response (pre-pagination) — wrap for graceful degradation.
  if (Array.isArray(data)) {
    const products = data as StockProductListItem[];
    return {
      items: products.map((product) => ({ kind: "product" as const, product })),
      page: 1,
      limit: products.length || 50,
      total: products.length,
      pageCount: products.length === 0 ? 0 : 1,
    };
  }
  return { items: [], page: 1, limit: 50, total: 0, pageCount: 0 };
}

export function asCatalogPage(data: unknown): CatalogPage {
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as CatalogPage).items)
  ) {
    return data as CatalogPage;
  }
  // Legacy KitchenCatalogDto shape
  if (data && typeof data === "object") {
    const legacy = data as {
      groups?: Array<{
        id: string;
        name: string;
        productCount: number;
        totalQuantity: string;
        defaultUnit: ProductUnit;
        batchCount?: number;
      }>;
      ungroupedProducts?: CatalogProduct[];
    };
    const items: CatalogListEntry[] = [];
    for (const group of legacy.groups ?? []) {
      items.push({
        kind: "group",
        groupId: group.id,
        groupName: group.name,
        variantCount: group.productCount,
        batchCount: group.batchCount ?? 0,
        totalQuantity: group.totalQuantity,
        defaultUnit: group.defaultUnit,
        variants: [],
      });
    }
    for (const product of legacy.ungroupedProducts ?? []) {
      items.push({
        kind: "product",
        product,
        groupName: product.groupName ?? null,
      });
    }
    return {
      items,
      page: 1,
      limit: items.length || 50,
      total: items.length,
      pageCount: items.length === 0 ? 0 : 1,
    };
  }
  return { items: [], page: 1, limit: 50, total: 0, pageCount: 0 };
}
