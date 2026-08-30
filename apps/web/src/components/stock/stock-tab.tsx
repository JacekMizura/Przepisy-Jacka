"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ChevronDown, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { ProductActionItem } from "@/components/stock/product-actions-menu";
import {
  StockFilters,
  type LocationFilter,
  type UnitFilter,
} from "@/components/stock/stock-filters";
import {
  formatGroupStockSubtitle,
} from "@/lib/stock-group-presentation";
import { formatGroupTotalQuantity } from "@/lib/format-quantity";
import { StockGroupThumb } from "@/components/stock/stock-group-thumb";
import {
  StockProductRow,
  productImageUrls,
} from "@/components/stock/stock-product-row";
import { newPurchaseHref } from "@/components/stock/stock-view";
import { PRODUCT_CATEGORY_OPTIONS } from "@/lib/product-media";
import { cn } from "@/lib/utils";

type Product = components["schemas"]["ProductDto"];
type StockSummary = components["schemas"]["StockProductSummaryDto"];

const UNCATEGORIZED = "Bez kategorii";

type StockListEntry =
  | {
      type: "product";
      key: string;
      summary: StockSummary;
      product?: Product;
      kindBadge?: string | null;
    }
  | {
      type: "group";
      key: string;
      groupId: string;
      groupName: string;
      items: Array<{ summary: StockSummary; product?: Product }>;
    };

type StockTabProps = {
  kitchenId: string;
  summaries: StockSummary[];
  products: Product[];
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
  locationFilter: LocationFilter;
  onLocationFilterChange: (value: LocationFilter) => void;
  onConsume: (summary: StockSummary, options?: { batchId?: string; preferManual?: boolean }) => void;
  onDeleteBatch: (batch: { id: string; label: string }) => void;
  onPreviewImage: (src: string, alt: string) => void;
  buildMenuItems: (args: {
    productId: string;
    productName: string;
    summary: StockSummary;
  }) => ProductActionItem[];
};

export function StockTab({
  kitchenId,
  summaries,
  products,
  isPending,
  isError,
  errorMessage,
  locationFilter,
  onLocationFilterChange,
  onConsume,
  onDeleteBatch,
  onPreviewImage,
  buildMenuItems,
}: StockTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState<UnitFilter>("");
  const [expandedStockIds, setExpandedStockIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );

  const productsById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const product of products) {
      map.set(product.id, product);
    }
    return map;
  }, [products]);

  const categoryOptions = useMemo(() => {
    const fromCatalog = new Set<string>(PRODUCT_CATEGORY_OPTIONS);
    for (const product of products) {
      if (product.category) {
        fromCatalog.add(product.category);
      }
    }
    return Array.from(fromCatalog).sort((a, b) => a.localeCompare(b, "pl"));
  }, [products]);

  const inStock = useMemo(
    () =>
      summaries.filter((summary) => Number(summary.totalQuantity) > 0),
    [summaries],
  );

  const filtered = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return inStock.filter((summary) => {
      if (categoryFilter) {
        const category = summary.category?.trim() || UNCATEGORIZED;
        if (category !== categoryFilter) {
          return false;
        }
      }
      if (unitFilter && summary.defaultUnit !== unitFilter) {
        return false;
      }
      if (needle) {
        const product = productsById.get(summary.productId);
        const haystack = [
          summary.productName,
          summary.category ?? "",
          product?.brand ?? "",
          product?.variantLabel ?? "",
          product?.ean ?? "",
          product?.groupName ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [categoryFilter, inStock, productsById, searchQuery, unitFilter]);

  const listEntries = useMemo(
    () => buildStockListEntries(filtered, productsById),
    [filtered, productsById],
  );

  function toggleStockExpanded(productId: string) {
    setExpandedStockIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  function toggleGroupExpanded(groupId: string) {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <section className="space-y-3">
      <StockFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        categoryOptions={categoryOptions}
        uncategorizedLabel={UNCATEGORIZED}
        unitFilter={unitFilter}
        onUnitChange={setUnitFilter}
        locationFilter={locationFilter}
        onLocationChange={onLocationFilterChange}
      />

      {isPending ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          Ładowanie zapasów…
        </div>
      ) : null}
      {isError ? (
        <div
          className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-red-600 shadow-sm"
          role="alert"
        >
          {errorMessage ?? "Nie udało się pobrać zapasów."}
        </div>
      ) : null}
      {!isPending && !isError && listEntries.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-8 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-900">
            Brak produktów w zapasach
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Dodaj zakup, aby zobaczyć ilości i daty ważności.
          </p>
          <Link
            href={newPurchaseHref(kitchenId)}
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm shadow-emerald-200 hover:bg-emerald-700"
          >
            <ShoppingBasket size={16} />
            Dodaj zakup
          </Link>
        </div>
      ) : null}
      {listEntries.length > 0 ? (
        <ul className="space-y-3">
          {listEntries.map((entry) => {
            if (entry.type === "product") {
              return (
                <li
                  key={entry.key}
                  className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
                >
                  <ul>
                    <StockProductRow
                      kitchenId={kitchenId}
                      summary={entry.summary}
                      product={entry.product}
                      kindBadge={entry.kindBadge}
                      expanded={expandedStockIds.has(entry.summary.productId)}
                      onToggleExpanded={() =>
                        toggleStockExpanded(entry.summary.productId)
                      }
                      onConsume={() => onConsume(entry.summary)}
                      onPreviewImage={onPreviewImage}
                      menuItems={buildMenuItems({
                        productId: entry.summary.productId,
                        productName: entry.summary.productName,
                        summary: entry.summary,
                      })}
                      onWriteOffBatch={(batchId) =>
                        onConsume(entry.summary, {
                          batchId,
                          preferManual: true,
                        })
                      }
                      onDeleteBatch={onDeleteBatch}
                    />
                  </ul>
                </li>
              );
            }

            const groupExpanded = expandedGroupIds.has(entry.groupId);
            const totalLabel = formatGroupTotalQuantity(
              entry.items.map((item) => item.summary),
            );
            const batchTotal = entry.items.reduce(
              (sum, item) => sum + item.summary.batchCount,
              0,
            );
            const covers = entry.items.map(
              (item) => productImageUrls(item.product).thumbnail,
            );
            const subtitle = formatGroupStockSubtitle({
              variantCount: entry.items.length,
              batchCount: batchTotal,
              totalLabel,
            });

            return (
              <li
                key={entry.key}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
              >
                <button
                  type="button"
                  className="grid w-full grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left hover:bg-gray-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 sm:gap-4 sm:px-4"
                  aria-expanded={groupExpanded}
                  onClick={() => toggleGroupExpanded(entry.groupId)}
                >
                  <StockGroupThumb imageUrls={covers} />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {entry.groupName}
                    </p>
                    <p className="text-sm leading-snug text-gray-600">
                      {subtitle}
                    </p>
                  </div>
                  <ChevronDown
                    size={18}
                    className={cn(
                      "shrink-0 text-gray-400 transition-transform",
                      groupExpanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                {groupExpanded ? (
                  <ul className="divide-y divide-gray-100 border-t border-gray-100">
                    {entry.items.map((item) => (
                      <StockProductRow
                        key={item.summary.productId}
                        kitchenId={kitchenId}
                        summary={item.summary}
                        product={item.product}
                        nested
                        expanded={expandedStockIds.has(item.summary.productId)}
                        onToggleExpanded={() =>
                          toggleStockExpanded(item.summary.productId)
                        }
                        onConsume={() => onConsume(item.summary)}
                        onPreviewImage={onPreviewImage}
                        menuItems={buildMenuItems({
                          productId: item.summary.productId,
                          productName: item.summary.productName,
                          summary: item.summary,
                        })}
                        onWriteOffBatch={(batchId) =>
                          onConsume(item.summary, {
                            batchId,
                            preferManual: true,
                          })
                        }
                        onDeleteBatch={onDeleteBatch}
                      />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function buildStockListEntries(
  summaries: StockSummary[],
  productsById: Map<string, Product>,
): StockListEntry[] {
  const ungrouped: StockListEntry[] = [];
  const groups = new Map<
    string,
    {
      groupId: string;
      groupName: string;
      items: Array<{ summary: StockSummary; product?: Product }>;
    }
  >();

  for (const summary of summaries) {
    const product = productsById.get(summary.productId);
    const groupId = product?.groupId ?? null;
    const groupName = product?.groupName?.trim() || null;
    if (!groupId || !groupName) {
      ungrouped.push({
        type: "product",
        key: summary.productId,
        summary,
        product,
      });
      continue;
    }
    const existing = groups.get(groupId);
    if (existing) {
      existing.items.push({ summary, product });
    } else {
      groups.set(groupId, {
        groupId,
        groupName,
        items: [{ summary, product }],
      });
    }
  }

  const groupEntries: StockListEntry[] = Array.from(groups.values())
    .sort((a, b) => a.groupName.localeCompare(b.groupName, "pl"))
    .map((group) => {
      if (group.items.length === 1) {
        const only = group.items[0]!;
        return {
          type: "product" as const,
          key: only.summary.productId,
          summary: only.summary,
          product: only.product,
          kindBadge: group.groupName,
        };
      }
      return {
        type: "group" as const,
        key: `group:${group.groupId}`,
        groupId: group.groupId,
        groupName: group.groupName,
        items: group.items.sort((a, b) =>
          a.summary.productName.localeCompare(b.summary.productName, "pl"),
        ),
      };
    });

  return [
    ...groupEntries,
    ...ungrouped.sort((a, b) => {
      if (a.type !== "product" || b.type !== "product") return 0;
      return a.summary.productName.localeCompare(b.summary.productName, "pl");
    }),
  ];
}
