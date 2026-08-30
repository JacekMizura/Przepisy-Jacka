"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { LOCATION_LABELS } from "@/lib/errors";
import type { BaseUnit } from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

export type LocationFilter = "" | keyof typeof LOCATION_LABELS;
export type UnitFilter = "" | BaseUnit;

const UNIT_OPTION_LABELS: Record<BaseUnit, string> = {
  gram: "g",
  piece: "szt",
  milliliter: "ml",
};

type StockFiltersProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  categoryOptions: string[];
  uncategorizedLabel: string;
  unitFilter: UnitFilter;
  onUnitChange: (value: UnitFilter) => void;
  locationFilter: LocationFilter;
  onLocationChange: (value: LocationFilter) => void;
  searchAriaLabel?: string;
  searchPlaceholder?: string;
};

export function StockFilters({
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  categoryOptions,
  uncategorizedLabel,
  unitFilter,
  onUnitChange,
  locationFilter,
  onLocationChange,
  searchAriaLabel = "Szukaj w zapasach",
  searchPlaceholder = "Szukaj…",
}: StockFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const filtersActive =
    Boolean(categoryFilter) || Boolean(unitFilter) || Boolean(locationFilter);

  const selects = (
    <>
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-gray-500 sm:max-w-[11rem]">
        <span className="sr-only sm:not-sr-only sm:font-medium sm:whitespace-nowrap">
          Kategoria
        </span>
        <select
          className="field-input min-w-0 flex-1 py-2"
          value={categoryFilter}
          onChange={(event) => onCategoryChange(event.target.value)}
          aria-label="Filtr kategorii"
        >
          <option value="">Wszystkie kategorie</option>
          <option value={uncategorizedLabel}>{uncategorizedLabel}</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 items-center gap-2 text-sm text-gray-500 sm:max-w-[8rem]">
        <span className="sr-only sm:not-sr-only sm:font-medium sm:whitespace-nowrap">
          Jednostka
        </span>
        <select
          className="field-input min-w-0 flex-1 py-2"
          value={unitFilter}
          onChange={(event) => onUnitChange(event.target.value as UnitFilter)}
          aria-label="Filtr jednostki"
        >
          <option value="">Jednostka</option>
          {(Object.keys(UNIT_OPTION_LABELS) as BaseUnit[]).map((unit) => (
            <option key={unit} value={unit}>
              {UNIT_OPTION_LABELS[unit]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 items-center gap-2 text-sm text-gray-500 sm:max-w-[10rem]">
        <span className="sr-only sm:not-sr-only sm:font-medium sm:whitespace-nowrap">
          Miejsce
        </span>
        <select
          className="field-input min-w-0 flex-1 py-2"
          value={locationFilter}
          onChange={(event) =>
            onLocationChange(event.target.value as LocationFilter)
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
    </>
  );

  return (
    <div className="rounded-2xl border border-gray-100 bg-white/80 p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          aria-label={searchAriaLabel}
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          className="sm:max-w-xs"
        />
        <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex">
          {selects}
        </div>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 sm:hidden"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <SlidersHorizontal size={16} aria-hidden />
          Filtry
          {filtersActive ? (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />
          ) : null}
          <ChevronDown
            size={16}
            className={cn(
              "text-gray-400 transition-transform",
              mobileOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>
      {mobileOpen ? (
        <div className="mt-3 flex flex-col gap-2 sm:hidden">{selects}</div>
      ) : null}
    </div>
  );
}
