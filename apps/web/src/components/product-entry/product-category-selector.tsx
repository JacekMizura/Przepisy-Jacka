"use client";

import {
  getProductCategoryPresentation,
  listProductCategoryTiles,
} from "@/lib/product-category-presentation";
import { cn } from "@/lib/utils";

type ProductCategorySelectorProps = {
  value: string;
  onChange: (next: string) => void;
  /** Dodatkowe etykiety z katalogu kuchni (np. historyczne). */
  extraOptions?: string[];
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function ProductCategorySelector({
  value,
  onChange,
  extraOptions = [],
  disabled = false,
  className,
  id = "product-entry-category",
}: ProductCategorySelectorProps) {
  const tiles = listProductCategoryTiles(extraOptions);
  const selectedValue = value.trim();

  return (
    <div className={cn("space-y-2", className)}>
      <p
        id={`${id}-label`}
        className="mb-1 block text-sm font-medium text-gray-700"
      >
        Kategoria
      </p>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {tiles.map((tile) => {
          const selected = selectedValue === tile.value;
          const Icon = tile.icon;
          return (
            <button
              key={tile.value || "__none__"}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={tile.label}
              onClick={() => onChange(tile.value)}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border px-2 py-2.5 transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? cn(tile.selectedClassName, "scale-[1.02] shadow-sm")
                  : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              <Icon className="mb-1 h-5 w-5" aria-hidden />
              <span className="text-center text-xs font-semibold leading-tight">
                {tile.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Mała etykieta kategorii z ikoną — podgląd / listy. */
export function ProductCategoryBadge({
  category,
  className,
}: {
  category: string | null | undefined;
  className?: string;
}) {
  const presentation = getProductCategoryPresentation(category);
  const Icon = presentation.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        presentation.accentTextClassName,
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {presentation.label}
    </span>
  );
}
