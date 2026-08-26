"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AVAILABILITY_STATUS_LABELS,
  formatRecipeIngredientQuantity,
  RECIPE_INGREDIENT_UNIT_LABELS,
} from "@/lib/recipe-labels";
import { cn } from "@/lib/utils";

type AvailabilityIngredient =
  components["schemas"]["RecipeIngredientAvailabilityDto"];

type AddRecipeGapsDialogProps = {
  recipeName: string;
  servings: number;
  ingredients: AvailabilityIngredient[];
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (includeUnknownIngredientIds: string[]) => void;
};

export function AddRecipeGapsDialog({
  recipeName,
  servings,
  ingredients,
  pending,
  onCancel,
  onConfirm,
}: AddRecipeGapsDialogProps) {
  const actionable = useMemo(
    () =>
      ingredients.filter(
        (ingredient) =>
          ingredient.status === "partial" ||
          ingredient.status === "missing" ||
          ingredient.status === "unknown",
      ),
    [ingredients],
  );

  const autoAdd = useMemo(
    () =>
      actionable.filter(
        (ingredient) =>
          ingredient.status === "partial" || ingredient.status === "missing",
      ),
    [actionable],
  );

  const unknown = useMemo(
    () => actionable.filter((ingredient) => ingredient.status === "unknown"),
    [actionable],
  );

  const [selectedUnknown, setSelectedUnknown] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleUnknown(id: string) {
    setSelectedUnknown((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const canConfirm = autoAdd.length > 0 || selectedUnknown.size > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={() => {
        if (!pending) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-gaps-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <ShoppingCart size={22} />
          </div>
          <div>
            <h2 id="add-gaps-title" className="text-lg font-semibold text-gray-900">
              Dodaj brakujące do listy zakupów
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Przepis „{recipeName}” dla {servings}{" "}
              {servings === 1 ? "porcji" : "porcji"}.
            </p>
          </div>
        </div>

        {actionable.length === 0 ? (
          <p className="text-sm text-gray-600">
            Brak składników do dodania — wszystkie powiązane produkty są dostępne
            albo nie można ich automatycznie ocenić.
          </p>
        ) : (
          <div className="space-y-6">
            {autoAdd.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-800">
                  Zostaną dodane automatycznie
                </h3>
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {autoAdd.map((ingredient) => (
                    <li
                      key={ingredient.ingredientId}
                      className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {ingredient.productName ?? ingredient.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          Wymagane:{" "}
                          {formatRecipeIngredientQuantity(
                            ingredient.scaledQuantity,
                            ingredient.unit,
                          )}
                        </p>
                      </div>
                      <div className="text-sm text-gray-700">
                        Do dodania:{" "}
                        {ingredient.gapQuantity
                          ? `${ingredient.gapQuantity} ${
                              ingredient.gapUnit
                                ? RECIPE_INGREDIENT_UNIT_LABELS[ingredient.gapUnit]
                                : ""
                            }`
                          : "pełna ilość"}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {unknown.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-800">
                  Wymagają ręcznej decyzji
                </h3>
                <p className="mb-3 text-sm text-gray-500">
                  Te składniki nie mają powiązania z produktem albo używają
                  jednostek, których nie da się bezpiecznie porównać ze
                  zapasami. Zaznacz te, które chcesz dodać mimo to.
                </p>
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {unknown.map((ingredient) => (
                    <li key={ingredient.ingredientId} className="px-4 py-3">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedUnknown.has(ingredient.ingredientId)}
                          onChange={() => toggleUnknown(ingredient.ingredientId)}
                        />
                        <span>
                          <span className="font-medium text-gray-900">
                            {ingredient.name}
                          </span>
                          <span className="mt-1 block text-sm text-gray-500">
                            {formatRecipeIngredientQuantity(
                              ingredient.scaledQuantity,
                              ingredient.unit,
                            )}{" "}
                            — {AVAILABILITY_STATUS_LABELS.unknown}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Anuluj
          </Button>
          <Button
            onClick={() => onConfirm(Array.from(selectedUnknown))}
            disabled={pending || !canConfirm}
          >
            {pending ? "Dodawanie…" : "Dodaj do listy zakupów"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function availabilityBadgeClass(status: AvailabilityIngredient["status"]) {
  return cn(
    "rounded-full px-2 py-0.5 text-xs font-medium",
    status === "available" && "bg-emerald-50 text-emerald-800",
    status === "partial" && "bg-amber-50 text-amber-800",
    status === "missing" && "bg-red-50 text-red-700",
    status === "unknown" && "bg-gray-100 text-gray-600",
  );
}
