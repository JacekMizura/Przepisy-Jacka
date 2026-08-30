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

  const fieldClass =
    "field-input w-full min-w-0 py-2 text-sm";

  const selects = (
    <>
      <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600">
        <span className="font-medium">Kategoria</span>
        <select
          className={fieldClass}
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
      <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600">
        <span className="font-medium">Jednostka</span>
        <select
          className={fieldClass}
          value={unitFilter}
          onChange={(event) => onUnitChange(event.target.value as UnitFilter)}
          aria-label="Filtr jednostki"
        >
          <option value="">Jednostki</option>
          {(Object.keys(UNIT_OPTION_LABELS) as BaseUnit[]).map((unit) => (
            <option key={unit} value={unit}>
              {UNIT_OPTION_LABELS[unit]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600">
        <span className="font-medium">Miejsce</span>
        <select
          className={fieldClass}
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
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 sm:hidden">
          <Input
            aria-label={searchAriaLabel}
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <SlidersHorizontal size={16} aria-hidden />
            Filtry
            {filtersActive ? (
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-600"
                aria-hidden
              />
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

        <div
          className={cn(
            "hidden gap-3 sm:grid",
            "sm:grid-cols-[minmax(260px,2fr)_minmax(180px,1fr)_minmax(150px,0.8fr)_minmax(170px,1fr)]",
          )}
        >
          <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600">
            <span className="font-medium">Szukaj</span>
            <Input
              aria-label={searchAriaLabel}
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full min-w-0"
            />
          </label>
          {selects}
        </div>

        {mobileOpen ? (
          <div className="grid grid-cols-1 gap-3 sm:hidden">{selects}</div>
        ) : null}
      </div>
    </div>
  );
}
