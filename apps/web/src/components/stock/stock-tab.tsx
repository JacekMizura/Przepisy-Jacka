"use client";

import { ChevronDown, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { ProductActionItem } from "@/components/stock/product-actions-menu";
import { StockListToolbar } from "@/components/stock/stock-filters";
import { StockGroupThumb } from "@/components/stock/stock-group-thumb";
import { StockProductRow, expiryTone } from "@/components/stock/stock-product-row";
import { newPurchaseHref } from "@/components/stock/stock-view";
import { LOCATION_LABELS } from "@/lib/errors";
import { formatDisplayQuantityWithUnit } from "@/lib/format-quantity";
import { formatGroupStockSubtitle } from "@/lib/stock-group-presentation";
import type {
  StockGroupListItem,
  StockListEntry,
  StockProductListItem,
} from "@/lib/stock-list-types";
import type {
  StockListUrlPatch,
  StockListUrlState,
} from "@/lib/stock-url-state";
import { cn } from "@/lib/utils";

type StockTabProps = {
  kitchenId: string;
  items: StockListEntry[];
  page: number;
  pageCount: number;
  total: number;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
  urlState: StockListUrlState;
  onUrlPatch: (patch: StockListUrlPatch) => void;
  onConsume: (
    summary: StockProductListItem,
    options?: { batchId?: string; preferManual?: boolean },
  ) => void;
  onDeleteBatch: (batch: { id: string; label: string }) => void;
  onPreviewImage: (src: string, alt: string) => void;
  buildMenuItems: (args: {
    productId: string;
    productName: string;
    summary: StockProductListItem;
  }) => ProductActionItem[];
};

export function StockTab({
  kitchenId,
  items,
  page,
  pageCount,
  total,
  isPending,
  isError,
  errorMessage,
  urlState,
  onUrlPatch,
  onConsume,
  onDeleteBatch,
  onPreviewImage,
  buildMenuItems,
}: StockTabProps) {
  const [expandedStockIds, setExpandedStockIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(),
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
      <StockListToolbar
        mode="stock"
        state={urlState}
        onPatch={onUrlPatch}
        resultTotal={total}
        resultLabel={total === 1 ? "pozycja" : "pozycji"}
        searchAriaLabel="Szukaj w zapasach"
      />

      {isPending ? (
        <div className="border border-gray-100 bg-white px-4 py-8 text-center text-sm text-gray-500">
          Ładowanie zapasów…
        </div>
      ) : null}
      {isError ? (
        <div
          className="border border-gray-100 bg-white px-4 py-8 text-center text-sm text-red-600"
          role="alert"
        >
          {errorMessage ?? "Nie udało się pobrać zapasów."}
        </div>
      ) : null}
      {!isPending && !isError && items.length === 0 ? (
        <div className="border border-gray-100 bg-white px-4 py-8 text-center">
          <p className="text-sm font-medium text-gray-900">
            Brak produktów w zapasach
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Dodaj zakup, aby zobaczyć ilości i daty ważności.
          </p>
          <Link
            href={newPurchaseHref(kitchenId)}
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <ShoppingBasket size={16} />
            Dodaj zakup
          </Link>
        </div>
      ) : null}

      {items.length > 0 ? (
        <>
          {/* Desktop compact table */}
          <div
            className="hidden border border-gray-200 bg-white md:block"
            data-testid="stock-compact-list"
          >
            <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(4.5rem,0.7fr)_minmax(3.5rem,0.55fr)_minmax(5.5rem,0.85fr)_minmax(5rem,0.75fr)_auto] gap-2 border-b border-gray-200 bg-gray-50 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <span>Produkt</span>
              <span>Stan</span>
              <span>Partie</span>
              <span>Najbliższy termin</span>
              <span>Miejsce</span>
              <span className="text-right">Akcje</span>
            </div>
            <ul>
              {items.map((entry) => {
                if (entry.kind === "product") {
                  const product = entry.product;
                  const kindBadge =
                    product.groupId && product.groupName
                      ? product.groupName
                      : null;
                  return (
                    <StockProductRow
                      key={product.productId}
                      kitchenId={kitchenId}
                      summary={product}
                      kindBadge={kindBadge}
                      layout="table"
                      expanded={expandedStockIds.has(product.productId)}
                      onToggleExpanded={() =>
                        toggleStockExpanded(product.productId)
                      }
                      onConsume={() => onConsume(product)}
                      onPreviewImage={onPreviewImage}
                      menuItems={buildMenuItems({
                        productId: product.productId,
                        productName: product.productName,
                        summary: product,
                      })}
                      onWriteOffBatch={(batchId) =>
                        onConsume(product, {
                          batchId,
                          preferManual: true,
                        })
                      }
                      onDeleteBatch={onDeleteBatch}
                    />
                  );
                }
                return (
                  <StockGroupTableBlock
                    key={`group:${entry.groupId}`}
                    kitchenId={kitchenId}
                    group={entry}
                    expanded={expandedGroupIds.has(entry.groupId)}
                    onToggle={() => toggleGroupExpanded(entry.groupId)}
                    expandedStockIds={expandedStockIds}
                    onToggleStock={toggleStockExpanded}
                    onConsume={onConsume}
                    onDeleteBatch={onDeleteBatch}
                    onPreviewImage={onPreviewImage}
                    buildMenuItems={buildMenuItems}
                  />
                );
              })}
            </ul>
          </div>

          {/* Mobile compact rows */}
          <ul className="border border-gray-200 bg-white md:hidden">
            {items.map((entry) => {
              if (entry.kind === "product") {
                const product = entry.product;
                const kindBadge =
                  product.groupId && product.groupName
                    ? product.groupName
                    : null;
                return (
                  <StockProductRow
                    key={product.productId}
                    kitchenId={kitchenId}
                    summary={product}
                    kindBadge={kindBadge}
                    layout="mobile"
                    expanded={expandedStockIds.has(product.productId)}
                    onToggleExpanded={() =>
                      toggleStockExpanded(product.productId)
                    }
                    onConsume={() => onConsume(product)}
                    onPreviewImage={onPreviewImage}
                    menuItems={buildMenuItems({
                      productId: product.productId,
                      productName: product.productName,
                      summary: product,
                    })}
                    onWriteOffBatch={(batchId) =>
                      onConsume(product, {
                        batchId,
                        preferManual: true,
                      })
                    }
                    onDeleteBatch={onDeleteBatch}
                  />
                );
              }
              return (
                <StockGroupMobileBlock
                  key={`group:${entry.groupId}`}
                  kitchenId={kitchenId}
                  group={entry}
                  expanded={expandedGroupIds.has(entry.groupId)}
                  onToggle={() => toggleGroupExpanded(entry.groupId)}
                  expandedStockIds={expandedStockIds}
                  onToggleStock={toggleStockExpanded}
                  onConsume={onConsume}
                  onDeleteBatch={onDeleteBatch}
                  onPreviewImage={onPreviewImage}
                  buildMenuItems={buildMenuItems}
                />
              );
            })}
          </ul>

          {pageCount > 1 ? (
            <PaginationBar
              page={page}
              pageCount={pageCount}
              onPage={(next) => onUrlPatch({ page: next })}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function StockGroupTableBlock({
  kitchenId,
  group,
  expanded,
  onToggle,
  expandedStockIds,
  onToggleStock,
  onConsume,
  onDeleteBatch,
  onPreviewImage,
  buildMenuItems,
}: {
  kitchenId: string;
  group: StockGroupListItem;
  expanded: boolean;
  onToggle: () => void;
  expandedStockIds: Set<string>;
  onToggleStock: (productId: string) => void;
  onConsume: StockTabProps["onConsume"];
  onDeleteBatch: StockTabProps["onDeleteBatch"];
  onPreviewImage: StockTabProps["onPreviewImage"];
  buildMenuItems: StockTabProps["buildMenuItems"];
}) {
  const qty = formatDisplayQuantityWithUnit(
    group.totalQuantity,
    group.defaultUnit,
  );
  const tone = expiryTone(group.nearestExpiry, group.expiringBatchCount);
  const expiryLabel = group.nearestExpiry
    ? new Date(group.nearestExpiry).toLocaleDateString("pl-PL")
    : "—";
  const place = group.primaryLocation
    ? LOCATION_LABELS[group.primaryLocation]
    : "—";
  const subtitle = formatGroupStockSubtitle({
    variantCount: group.variantCount,
    batchCount: group.batchCount,
  });

  return (
    <li>
      <button
        type="button"
        className="grid min-h-14 w-full grid-cols-[minmax(0,2.2fr)_minmax(4.5rem,0.7fr)_minmax(3.5rem,0.55fr)_minmax(5.5rem,0.85fr)_minmax(5rem,0.75fr)_auto] items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-left text-sm hover:bg-gray-50"
        aria-expanded={expanded}
        data-testid="stock-group-row"
        onClick={onToggle}
      >
        <div className="flex min-w-0 items-center gap-2">
          <StockGroupThumb size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">
              {group.groupName}
            </p>
            <p className="truncate text-[11px] text-gray-500">{subtitle}</p>
          </div>
        </div>
        <p className="tabular-nums text-gray-800">{qty}</p>
        <p className="tabular-nums text-gray-600">{group.batchCount}</p>
        <p
          className={cn(
            "tabular-nums",
            tone === "expired" && "font-medium text-red-700",
            tone === "expiring" && "font-medium text-orange-700",
            tone === "none" && "text-gray-600",
          )}
        >
          {expiryLabel}
        </p>
        <p className="truncate text-gray-600">{place}</p>
        <div className="flex items-center justify-end">
          <ChevronDown
            size={15}
            className={cn(
              "text-gray-400 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </div>
      </button>
      {expanded ? (
        <ul>
          {group.variants.map((product) => (
            <StockProductRow
              key={product.productId}
              kitchenId={kitchenId}
              summary={product}
              nested
              layout="table"
              expanded={expandedStockIds.has(product.productId)}
              onToggleExpanded={() => onToggleStock(product.productId)}
              onConsume={() => onConsume(product)}
              onPreviewImage={onPreviewImage}
              menuItems={buildMenuItems({
                productId: product.productId,
                productName: product.productName,
                summary: product,
              })}
              onWriteOffBatch={(batchId) =>
                onConsume(product, { batchId, preferManual: true })
              }
              onDeleteBatch={onDeleteBatch}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function StockGroupMobileBlock({
  kitchenId,
  group,
  expanded,
  onToggle,
  expandedStockIds,
  onToggleStock,
  onConsume,
  onDeleteBatch,
  onPreviewImage,
  buildMenuItems,
}: {
  kitchenId: string;
  group: StockGroupListItem;
  expanded: boolean;
  onToggle: () => void;
  expandedStockIds: Set<string>;
  onToggleStock: (productId: string) => void;
  onConsume: StockTabProps["onConsume"];
  onDeleteBatch: StockTabProps["onDeleteBatch"];
  onPreviewImage: StockTabProps["onPreviewImage"];
  buildMenuItems: StockTabProps["buildMenuItems"];
}) {
  const qty = formatDisplayQuantityWithUnit(
    group.totalQuantity,
    group.defaultUnit,
  );
  const tone = expiryTone(group.nearestExpiry, group.expiringBatchCount);
  const expiryLabel = group.nearestExpiry
    ? new Date(group.nearestExpiry).toLocaleDateString("pl-PL")
    : "—";
  const subtitle = formatGroupStockSubtitle({
    variantCount: group.variantCount,
    batchCount: group.batchCount,
  });

  return (
    <li>
      <button
        type="button"
        className="flex min-h-[64px] w-full items-center gap-2 border-b border-gray-100 px-2 py-2 text-left"
        aria-expanded={expanded}
        data-testid="stock-group-row"
        onClick={onToggle}
      >
        <StockGroupThumb size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {group.groupName}
          </p>
          <p className="text-[11px] text-gray-500">{subtitle}</p>
          <p className="mt-0.5 text-xs text-gray-700">
            <span className="font-medium">{qty}</span>
            <span
              className={cn(
                "ml-1.5",
                tone === "expired" && "font-medium text-red-700",
                tone === "expiring" && "font-medium text-orange-700",
                tone === "none" && "text-gray-500",
              )}
            >
              {expiryLabel}
            </span>
          </p>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-gray-400 transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {expanded ? (
        <ul>
          {group.variants.map((product) => (
            <StockProductRow
              key={product.productId}
              kitchenId={kitchenId}
              summary={product}
              nested
              layout="mobile"
              expanded={expandedStockIds.has(product.productId)}
              onToggleExpanded={() => onToggleStock(product.productId)}
              onConsume={() => onConsume(product)}
              onPreviewImage={onPreviewImage}
              menuItems={buildMenuItems({
                productId: product.productId,
                productName: product.productName,
                summary: product,
              })}
              onWriteOffBatch={(batchId) =>
                onConsume(product, { batchId, preferManual: true })
              }
              onDeleteBatch={onDeleteBatch}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function PaginationBar({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
      <button
        type="button"
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 disabled:opacity-40"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Poprzednia
      </button>
      <span className="tabular-nums">
        Strona {page} / {pageCount}
      </span>
      <button
        type="button"
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 disabled:opacity-40"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        Następna
      </button>
    </div>
  );
}
