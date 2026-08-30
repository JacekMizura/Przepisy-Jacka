"use client";

import { Filter, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";

import {
  CatalogGroupCard,
  CatalogProductCard,
} from "@/components/stock/catalog-card";
import type { ProductActionItem } from "@/components/stock/product-actions-menu";
import { StockViewTabs } from "@/components/stock/stock-view-tabs";
import { LOCATION_LABELS } from "@/lib/errors";
import { formatDisplayQuantityWithUnit } from "@/lib/format-quantity";
import { PRODUCT_CATEGORY_OPTIONS } from "@/lib/product-media";
import type { CatalogListEntry } from "@/lib/stock-list-types";
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

const CATALOG_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "name", label: "Nazwa" },
  { value: "newest", label: "Najnowsze" },
  { value: "updated", label: "Aktualizacja" },
  { value: "has_stock", label: "Ze stanem" },
];

type ProductCatalogPanelProps = {
  kitchenId: string;
  embedded?: boolean;
  items: CatalogListEntry[];
  page: number;
  pageCount: number;
  total: number;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
  urlState: StockListUrlState;
  onUrlPatch: (patch: StockListUrlPatch) => void;
  onPreview?: (src: string, alt: string) => void;
  onArchiveProduct?: (product: { id: string; name: string }) => void;
  onUndoAddition?: (product: { id: string; name: string }) => void;
  onWriteOffAndArchive?: (product: { id: string; name: string }) => void;
  onAddToList?: (product: { id: string; name: string }) => void;
  addToListPending?: boolean;
  buildMenuItems?: (product: {
    id: string;
    name: string;
    groupId?: string | null;
    totalQuantity?: string;
  }) => ProductActionItem[];
};

export function ProductCatalogPanel({
  kitchenId,
  embedded = false,
  items,
  page,
  pageCount,
  total,
  isPending,
  isError,
  errorMessage,
  urlState,
  onUrlPatch,
  onPreview,
  buildMenuItems,
}: ProductCatalogPanelProps) {
  return (
    <div className={cn("space-y-6", !embedded && "p-4")}>
      <CatalogModernChrome
        kitchenId={kitchenId}
        state={urlState}
        onPatch={onUrlPatch}
        resultTotal={total}
      />

      {isPending ? (
        <div className="rounded-3xl border border-slate-100 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Ładowanie katalogu…
        </div>
      ) : null}
      {isError ? (
        <div
          className="rounded-3xl border border-slate-100 bg-white px-4 py-10 text-center text-sm text-red-600"
          role="alert"
        >
          {errorMessage ?? "Nie udało się pobrać katalogu."}
        </div>
      ) : null}

      {!isPending && !isError && items.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          {urlState.search
            ? "Brak wyników dla tego wyszukiwania."
            : "Katalog jest pusty — dodaj pierwszy produkt."}
        </p>
      ) : null}

      {items.length > 0 ? (
        <>
          <div
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="catalog-cards-grid"
          >
            {items.map((entry) => {
              if (entry.kind === "product") {
                const product = entry.product;
                const menuItems =
                  buildMenuItems?.({
                    id: product.id,
                    name: product.name,
                    groupId: product.groupId,
                    totalQuantity: product.totalQuantity,
                  }) ?? [];
                return (
                  <CatalogProductCard
                    key={product.id}
                    kitchenId={kitchenId}
                    product={product}
                    menuItems={menuItems}
                    onPreview={onPreview}
                  />
                );
              }
              return (
                <CatalogGroupCard
                  key={`group:${entry.groupId}`}
                  kitchenId={kitchenId}
                  groupId={entry.groupId}
                  groupName={entry.groupName}
                  variantCount={entry.variantCount}
                  category={entry.variants[0]?.category ?? null}
                />
              );
            })}
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-medium disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => onUrlPatch({ page: page - 1 })}
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
                onClick={() => onUrlPatch({ page: page + 1 })}
              >
                Następna
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function CatalogModernChrome({
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
    state.archived !== "active" ||
    state.hasStock;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-3xl border border-slate-200/60 bg-white p-2 shadow-sm lg:flex-row">
        <div className="min-w-0 overflow-x-auto">
          <StockViewTabs
            kitchenId={kitchenId}
            active="catalog"
            urlState={state}
            variant="modern"
          />
        </div>

        <div className="flex flex-1 items-center rounded-2xl bg-white px-4 transition-all focus-within:ring-2 focus-within:ring-emerald-500/20">
          <Search size={18} className="shrink-0 text-slate-400" aria-hidden />
          <input
            type="search"
            aria-label="Szukaj w katalogu"
            placeholder="Szukaj produktu, kategorii..."
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            className="w-full border-none bg-transparent px-3 py-3 font-medium text-slate-700 placeholder:font-normal placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 border-slate-100 py-1 pl-2 lg:border-l">
          <button
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              filtersActive
                ? "bg-emerald-50 text-emerald-800"
                : "text-slate-600 hover:bg-slate-50",
            )}
            aria-expanded={filtersOpen}
            aria-controls={panelId}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Filter size={16} aria-hidden />
            Filtry
          </button>
          <div className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" />
          <span className="whitespace-nowrap px-3 text-sm font-medium text-slate-400">
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
            <span className="font-medium">Sortowanie</span>
            <select
              className="field-input w-full min-w-0 py-2 text-sm"
              value={state.sort}
              onChange={(event) => onPatch({ sort: event.target.value })}
            >
              {CATALOG_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-emerald-600"
              checked={state.hasStock}
              onChange={(event) => onPatch({ hasStock: event.target.checked })}
            />
            Tylko ze stanem
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

export function formatGroupStock(
  group: import("@moja-kuchnia/api-client").components["schemas"]["ProductGroupSummaryDto"],
): string {
  if (group.stockByUnit.length === 0) {
    return "Brak w zapasach";
  }
  return group.stockByUnit
    .map((entry) =>
      formatDisplayQuantityWithUnit(entry.totalQuantity, entry.unit),
    )
    .join(" · ");
}
