"use client";

import { cn } from "@/lib/utils";

type CategoryOption = {
  id: string;
  name: string;
};

type RecipeCategoryPickerProps = {
  categories: CategoryOption[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  disabled?: boolean;
};

export function RecipeCategoryPicker({
  categories,
  selectedIds,
  onChange,
  disabled = false,
}: RecipeCategoryPickerProps) {
  const selected = new Set(selectedIds);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-900">Kategorie</p>
      <p className="text-xs text-gray-500">
        Opcjonalnie — możesz wybrać kilka lub żadnej.
      </p>
      <div className="flex flex-wrap gap-2">
        {categories.length === 0 ? (
          <p className="text-sm text-gray-500">Brak kategorii w kuchni.</p>
        ) : (
          categories.map((category) => {
            const isSelected = selected.has(category.id);
            return (
              <button
                key={category.id}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                onClick={() => {
                  if (isSelected) {
                    onChange(selectedIds.filter((id) => id !== category.id));
                    return;
                  }
                  onChange([...selectedIds, category.id]);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  isSelected
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                {category.name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function RecipeCategoryLabels({
  categories,
  maxVisible = 2,
  className,
}: {
  categories: CategoryOption[];
  maxVisible?: number;
  className?: string;
}) {
  if (categories.length === 0) {
    return null;
  }
  const visible = categories.slice(0, maxVisible);
  const rest = categories.length - visible.length;

  return (
    <div className={cn("flex flex-wrap justify-center gap-1", className)}>
      {visible.map((category) => (
        <span
          key={category.id}
          className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium tracking-wide text-emerald-800 uppercase"
        >
          {category.name}
        </span>
      ))}
      {rest > 0 ? (
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
          +{rest}
        </span>
      ) : null}
    </div>
  );
}
