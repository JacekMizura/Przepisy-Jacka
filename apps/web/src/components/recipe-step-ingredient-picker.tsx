"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRecipeIngredientQuantity } from "@/lib/recipe-labels";

export type AssignableIngredient = {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  note: string;
};

type RecipeStepIngredientPickerProps = {
  stepTitle: string;
  ingredients: AssignableIngredient[];
  selectedKeys: string[];
  onApply: (keys: string[]) => void;
  onClose: () => void;
};

export function RecipeStepIngredientPicker({
  stepTitle,
  ingredients,
  selectedKeys,
  onApply,
  onClose,
}: RecipeStepIngredientPickerProps) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selectedKeys));
  const showSearch = ingredients.length > 8;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pl");
    if (!normalized) {
      return ingredients;
    }
    return ingredients.filter((ingredient) =>
      `${ingredient.name} ${ingredient.note}`
        .toLocaleLowerCase("pl")
        .includes(normalized),
    );
  }, [ingredients, query]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-ingredient-picker-title"
        className="flex max-h-[min(32rem,90dvh)] w-full max-w-md flex-col rounded-t-2xl border border-stone-200 bg-white shadow-lg sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-stone-100 px-5 py-4">
          <h2
            id="step-ingredient-picker-title"
            className="text-lg font-semibold text-stone-900"
          >
            Przypisz składniki
          </h2>
          <p className="mt-1 text-sm text-stone-500">{stepTitle}</p>
        </div>
        {showSearch ? (
          <div className="px-5 pt-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Szukaj składnika…"
              aria-label="Szukaj składnika"
              autoFocus
            />
          </div>
        ) : null}
        <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <li className="px-2 py-6 text-center text-sm text-stone-500">
              Brak składników do przypisania.
            </li>
          ) : (
            filtered.map((ingredient) => {
              const checked = draft.has(ingredient.key);
              const inputId = `assign-${ingredient.key}`;
              return (
                <li key={ingredient.key}>
                  <label
                    htmlFor={inputId}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-stone-50"
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      className="h-5 w-5 rounded border-stone-300 text-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500"
                      checked={checked}
                      onChange={() => {
                        setDraft((current) => {
                          const next = new Set(current);
                          if (next.has(ingredient.key)) {
                            next.delete(ingredient.key);
                          } else {
                            next.add(ingredient.key);
                          }
                          return next;
                        });
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-stone-800">
                        {ingredient.name || "Bez nazwy"}
                      </span>
                      {ingredient.note ? (
                        <span className="block truncate text-xs text-stone-400">
                          {ingredient.note}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-stone-700">
                      {formatRecipeIngredientQuantity(
                        ingredient.quantity || null,
                        ingredient.unit as Parameters<
                          typeof formatRecipeIngredientQuantity
                        >[1],
                      )}
                    </span>
                  </label>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-stone-100 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft(new Set(ingredients.map((ingredient) => ingredient.key)))
            }
          >
            Zaznacz wszystkie
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDraft(new Set())}
          >
            Wyczyść
          </Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Anuluj
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onApply([...draft])}
            >
              Zastosuj
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
