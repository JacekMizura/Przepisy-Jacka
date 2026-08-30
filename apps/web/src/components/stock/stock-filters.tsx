"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { LOCATION_LABELS } from "@/lib/errors";
import { PRODUCT_CATEGORY_OPTIONS } from "@/lib/product-media";
import type { ExpiryStatusFilter } from "@/lib/stock-list-types";
import {
  activeFilterChips,
  clearAllFiltersPatch,
  type LocationFilterValue,
  type StockListUrlPatch,
  type StockListUrlState,
  type UnitFilterValue,
} from "@/lib/stock-url-state";
import { cn } from "@/lib/utils";

export type LocationFilter = LocationFilterValue;
export type UnitFilter = UnitFilterValue;

const UNIT_OPTION_LABELS: Record<Exclude<UnitFilterValue, "">, string> = {
  gram: "g",
  piece: "szt",
  milliliter: "ml",
};

const STOCK_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "expiry", label: "Termin" },
  { value: "newest", label: "Najnowsze" },
  { value: "name", label: "Nazwa" },
  { value: "qty_desc", label: "Ilość ↓" },
  { value: "qty_asc", label: "Ilość ↑" },
];

const CATALOG_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "name", label: "Nazwa" },
  { value: "newest", label: "Najnowsze" },
  { value: "updated", label: "Aktualizacja" },
  { value: "has_stock", label: "Ze stanem" },
];

const EXPIRY_OPTIONS: { value: ExpiryStatusFilter; label: string }[] = [
  { value: "any", label: "Dowolny" },
  { value: "expired", label: "Przeterminowane" },
  { value: "expiring", label: "Kończące się" },
  { value: "ok", label: "Ważne" },
  { value: "none", label: "Bez terminu" },
];

type StockListToolbarProps = {
  mode: "stock" | "catalog";
  state: StockListUrlState;
  onPatch: (patch: StockListUrlPatch) => void;
  categoryOptions?: string[];
  resultTotal: number;
  resultLabel?: string;
  searchAriaLabel?: string;
  searchPlaceholder?: string;
};

export function StockListToolbar({
  mode,
  state,
  onPatch,
  categoryOptions = [...PRODUCT_CATEGORY_OPTIONS],
  resultTotal,
  resultLabel = "wyników",
  searchAriaLabel = "Szukaj",
  searchPlaceholder = "Szukaj…",
}: StockListToolbarProps) {
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
  const advancedActive =
    Boolean(state.unit) ||
    state.expiryStatus !== "any" ||
    (mode === "stock"
      ? state.archived !== "all"
      : state.archived !== "active" || state.hasStock);

  const sortOptions =
    mode === "catalog" ? CATALOG_SORT_OPTIONS : STOCK_SORT_OPTIONS;
  const fieldClass = "field-input w-full min-w-0 py-2 text-sm";

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <Input
          aria-label={searchAriaLabel}
          placeholder={searchPlaceholder}
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          className="min-w-0 flex-1"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="hidden min-w-[9rem] flex-col gap-0.5 text-xs text-gray-500 sm:flex">
            <span className="sr-only">Kategoria</span>
            <select
              className={fieldClass}
              value={state.category}
              onChange={(event) => onPatch({ category: event.target.value })}
              aria-label="Filtr kategorii"
            >
              <option value="">Kategoria</option>
              <option value="Bez kategorii">Bez kategorii</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="hidden min-w-[8rem] flex-col gap-0.5 text-xs text-gray-500 sm:flex">
            <span className="sr-only">Miejsce</span>
            <select
              className={fieldClass}
              value={state.place}
              onChange={(event) =>
                onPatch({
                  place: event.target.value as LocationFilterValue,
                })
              }
              aria-label="Filtr miejsca"
            >
              <option value="">Miejsce</option>
              {Object.entries(LOCATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[7.5rem] flex-1 flex-col gap-0.5 text-xs text-gray-500 sm:flex-none">
            <span className="sr-only">Sortowanie</span>
            <select
              className={fieldClass}
              value={state.sort}
              onChange={(event) => onPatch({ sort: event.target.value })}
              aria-label="Sortowanie"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={cn(
              "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
              advancedActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
            )}
            aria-expanded={filtersOpen}
            aria-controls={panelId}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={15} aria-hidden />
            Filtry
            {advancedActive ? (
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-600"
                aria-hidden
              />
            ) : null}
          </button>
          <p className="hidden text-xs text-gray-500 tabular-nums md:block">
            {resultTotal} {resultLabel}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-500 tabular-nums md:hidden">
        {resultTotal} {resultLabel}
      </p>

      {filtersOpen ? (
        <div
          id={panelId}
          className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50/80 p-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600 sm:hidden">
            <span className="font-medium">Kategoria</span>
            <select
              className={fieldClass}
              value={state.category}
              onChange={(event) => onPatch({ category: event.target.value })}
            >
              <option value="">Wszystkie</option>
              <option value="Bez kategorii">Bez kategorii</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600 sm:hidden">
            <span className="font-medium">Miejsce</span>
            <select
              className={fieldClass}
              value={state.place}
              onChange={(event) =>
                onPatch({
                  place: event.target.value as LocationFilterValue,
                })
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
          <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600">
            <span className="font-medium">Jednostka</span>
            <select
              className={fieldClass}
              value={state.unit}
              onChange={(event) =>
                onPatch({ unit: event.target.value as UnitFilterValue })
              }
              aria-label="Filtr jednostki"
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
          {mode === "stock" ? (
            <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600">
              <span className="font-medium">Termin ważności</span>
              <select
                className={fieldClass}
                value={state.expiryStatus}
                onChange={(event) =>
                  onPatch({
                    expiryStatus: event.target.value as ExpiryStatusFilter,
                  })
                }
                aria-label="Filtr terminu"
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600">
            <span className="font-medium">Archiwum</span>
            <select
              className={fieldClass}
              value={state.archived}
              onChange={(event) =>
                onPatch({
                  archived: event.target.value as StockListUrlState["archived"],
                })
              }
              aria-label="Filtr archiwum"
            >
              <option value="active">Aktywne</option>
              <option value="archived">Zarchiwizowane</option>
              <option value="all">Wszystkie</option>
            </select>
          </label>
          {mode === "catalog" ? (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                checked={state.hasStock}
                onChange={(event) =>
                  onPatch({ hasStock: event.target.checked })
                }
              />
              Tylko ze stanem
            </label>
          ) : null}
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              onClick={() => onPatch(chip.clear)}
            >
              {chip.label}
              <X size={12} aria-hidden />
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
