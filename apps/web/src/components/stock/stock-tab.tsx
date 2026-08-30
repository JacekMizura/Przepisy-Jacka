"use client";

import { Filter, Search, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";

import type { ProductActionItem } from "@/components/stock/product-actions-menu";
import {
  InventoryGroupCard,
  InventoryProductCard,
} from "@/components/stock/inventory-card";
import { StockViewTabs } from "@/components/stock/stock-view-tabs";
import { newPurchaseHref } from "@/components/stock/stock-view";
import { LOCATION_LABELS } from "@/lib/errors";
import { PRODUCT_CATEGORY_OPTIONS } from "@/lib/product-media";
import type { ExpiryStatusFilter, StockListEntry, StockProductListItem } from "@/lib/stock-list-types";
import {
  activeFilterChips,
  clearAllFiltersPatch,
  type LocationFilterValue,
  type StockListUrlPatch,
  type StockListUrlState,
  type UnitFilterValue,
} from "@/lib/stock-url-state";
import { cn } from "@/lib/utils";

const UNIT_OPTION_LABELS: Record<Exclude<UnitFilterValue, "">, string> = {
  gram: "g",
  piece: "szt",
  milliliter: "ml",
};

const EXPIRY_OPTIONS: { value: ExpiryStatusFilter; label: string }[] = [
  { value: "any", label: "Dowolny" },
  { value: "expired", label: "Przeterminowane" },
  { value: "expiring", label: "Kończące się" },
  { value: "ok", label: "Ważne" },
  { value: "none", label: "Bez terminu" },
];

const STOCK_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "expiry", label: "Termin" },
  { value: "newest", label: "Najnowsze" },
  { value: "name", label: "Nazwa" },
  { value: "qty_desc", label: "Ilość ↓" },
  { value: "qty_asc", label: "Ilość ↑" },
];

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
  onPreviewImage,
  buildMenuItems,
}: StockTabProps) {
  return (
    <section className="space-y-6">
      <StockModernChrome
        kitchenId={kitchenId}
        state={urlState}
        onPatch={onUrlPatch}
        resultTotal={total}
      />

      {isPending ? (
        <div className="rounded-3xl border border-slate-100 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Ładowanie zapasów…
        </div>
      ) : null}
      {isError ? (
        <div
          className="rounded-3xl border border-slate-100 bg-white px-4 py-10 text-center text-sm text-red-600"
          role="alert"
        >
          {errorMessage ?? "Nie udało się pobrać zapasów."}
        </div>
      ) : null}
      {!isPending && !isError && items.length === 0 ? (
        <div className="rounded-3xl border border-slate-100 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">
            Brak produktów w zapasach
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Dodaj zakup, aby zobaczyć ilości i daty ważności.
          </p>
          <Link
            href={newPurchaseHref(kitchenId)}
            className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white"
          >
            <ShoppingBasket size={16} />
            Dodaj nowy zakup
          </Link>
        </div>
      ) : null}

      {items.length > 0 ? (
        <>
          <div
            className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="stock-cards-grid"
          >
            {items.map((entry) => {
              if (entry.kind === "product") {
                const product = entry.product;
                return (
                  <InventoryProductCard
                    key={product.productId}
                    kitchenId={kitchenId}
                    product={product}
                    onConsume={() => onConsume(product)}
                    onPreviewImage={onPreviewImage}
                    menuItems={buildMenuItems({
                      productId: product.productId,
                      productName: product.productName,
                      summary: product,
                    })}
                  />
                );
              }
              return (
                <InventoryGroupCard
                  key={`group:${entry.groupId}`}
                  kitchenId={kitchenId}
                  group={entry}
                  onConsumeVariant={(product) => onConsume(product)}
                  onPreviewImage={onPreviewImage}
                  buildMenuItems={buildMenuItems}
                />
              );
            })}
          </div>

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

function StockModernChrome({
  kitchenId,
  state,
  onPatch,
  resultTotal,
}: {
  kitchenId: string;
  state: StockListUrlState;
  onPatch: (patch: StockListUrlPatch) => void;
  resultTotal: number;
}) {
  const [searchDraft, setSearchDraft] = useState(state.search);
  const [syncedSearch, setSyncedSearch] = useState(state.search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelId = useId();

  if (state.search !== syncedSearch) {
    setSyncedSearch(state.search);
    setSearchDraft(state.search);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchDraft.trim() !== state.search) {
        onPatch({ search: searchDraft.trim() });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [onPatch, searchDraft, state.search]);

  const chips = activeFilterChips(state);
  const filtersActive =
    Boolean(state.category) ||
    Boolean(state.place) ||
    Boolean(state.unit) ||
    state.expiryStatus !== "any" ||
    state.archived !== "all";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-zinc-400"
            size={20}
            aria-hidden
          />
          <input
            type="search"
            aria-label="Szukaj w zapasach"
            placeholder="Szukaj po nazwie, kodzie EAN..."
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-3.5 pr-4 pl-12 text-sm font-medium shadow-sm transition-all focus:ring-2 focus:ring-zinc-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 overflow-x-auto">
            <StockViewTabs
              kitchenId={kitchenId}
              active="stock"
              urlState={state}
              variant="modern"
            />
          </div>
          <button
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors",
              filtersActive
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
            )}
            aria-expanded={filtersOpen}
            aria-controls={panelId}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Filter size={16} aria-hidden />
            Filtry
          </button>
          <span className="whitespace-nowrap px-2 text-sm font-medium text-zinc-400">
            {resultTotal} pozycji
          </span>
        </div>
      </div>

      {filtersOpen ? (
        <div
          id={panelId}
          className="grid grid-cols-1 gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-600">
            <span className="font-medium">Kategoria</span>
            <select
              className="field-input w-full min-w-0 py-2 text-sm"
              value={state.category}
              onChange={(event) => onPatch({ category: event.target.value })}
            >
              <option value="">Wszystkie</option>
              <option value="Bez kategorii">Bez kategorii</option>
              {PRODUCT_CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-600">
            <span className="font-medium">Miejsce</span>
            <select
              className="field-input w-full min-w-0 py-2 text-sm"
              value={state.place}
              onChange={(event) =>
                onPatch({ place: event.target.value as LocationFilterValue })
              }
            >
              <option value="">Wszystkie</option>
              {Object.entries(LOCATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-600">
            <span className="font-medium">Jednostka</span>
            <select
              className="field-input w-full min-w-0 py-2 text-sm"
              value={state.unit}
              onChange={(event) =>
                onPatch({ unit: event.target.value as UnitFilterValue })
              }
            >
              <option value="">Wszystkie</option>
              {(Object.keys(UNIT_OPTION_LABELS) as Array<
                Exclude<UnitFilterValue, "">
              >).map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_OPTION_LABELS[unit]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-600">
            <span className="font-medium">Termin</span>
            <select
              className="field-input w-full min-w-0 py-2 text-sm"
              value={state.expiryStatus}
              onChange={(event) =>
                onPatch({
                  expiryStatus: event.target.value as ExpiryStatusFilter,
                })
              }
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-slate-600">
            <span className="font-medium">Sortowanie</span>
            <select
              className="field-input w-full min-w-0 py-2 text-sm"
              value={state.sort}
              onChange={(event) => onPatch({ sort: event.target.value })}
            >
              {STOCK_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
              onClick={() => onPatch(chip.clear)}
            >
              {chip.label}
            </button>
          ))}
          <button
            type="button"
            className="text-xs font-medium text-emerald-700 hover:underline"
            onClick={() => onPatch(clearAllFiltersPatch(state))}
          >
            Wyczyść filtry
          </button>
        </div>
      ) : null}
    </div>
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
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
      <button
        type="button"
        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-medium disabled:opacity-40"
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
        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-medium disabled:opacity-40"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        Następna
      </button>
    </div>
  );
}
