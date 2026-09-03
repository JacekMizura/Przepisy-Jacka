"use client";

import type { components } from "@moja-kuchnia/api-client";
import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";

import {
  buildIngredientClipboardSections,
  formatIngredientsClipboardText,
  type RecipeClipboardIngredient,
} from "@/lib/recipe-clipboard";
import { formatRecipeIngredientQuantity } from "@/lib/recipe-labels";
import { cn } from "@/lib/utils";

type Ingredient = components["schemas"]["RecipeIngredientDto"];
type IngredientGroup = components["schemas"]["RecipeIngredientGroupDto"];
type Availability =
  components["schemas"]["RecipeIngredientAvailabilityDto"];

type RecipeIngredientsPanelProps = {
  ingredients: Ingredient[];
  ingredientGroups?: IngredientGroup[];
  availabilityByIngredientId: Map<string, Availability>;
  checkedIngredientIds: Set<string>;
  availabilityPending: boolean;
  availabilityError: string | null;
  onToggleIngredient: (id: string) => void;
};

export function RecipeIngredientsPanel({
  ingredients,
  ingredientGroups = [],
  availabilityByIngredientId,
  checkedIngredientIds,
  availabilityPending,
  availabilityError,
  onToggleIngredient,
}: RecipeIngredientsPanelProps) {
  const [copied, setCopied] = useState(false);

  const sortedIngredients = useMemo(
    () =>
      ingredients
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [ingredients],
  );

  const sections = useMemo(
    () =>
      buildIngredientClipboardSections(sortedIngredients, ingredientGroups),
    [ingredientGroups, sortedIngredients],
  );

  async function copyIngredients() {
    const clipboardIngredients: RecipeClipboardIngredient[] =
      sortedIngredients.map((ingredient) => {
        const availability = availabilityByIngredientId.get(ingredient.id);
        return {
          ...ingredient,
          displayQuantity:
            availability?.scaledQuantity ?? ingredient.quantity,
          displayUnit: availability?.unit ?? ingredient.unit,
          displayName: ingredientDisplayName(ingredient, availability),
        };
      });
    const text = formatIngredientsClipboardText(
      clipboardIngredients,
      ingredientGroups,
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      className="recipe-ingredients-panel lg:sticky lg:top-[7.5rem] lg:self-start"
      data-testid="recipe-ingredients-panel"
    >
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="font-serif text-2xl font-semibold text-stone-900">
          Składniki
        </h2>
        <button
          type="button"
          className="recipe-print-hide inline-flex items-center gap-1 text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
          onClick={() => void copyIngredients()}
          aria-label="Kopiuj listę składników"
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Skopiowano" : "Kopiuj"}
        </button>
      </div>

      {availabilityPending ? (
        <p className="py-3 text-sm text-stone-500">Sprawdzanie zapasów…</p>
      ) : null}
      {availabilityError ? (
        <p className="py-3 text-sm text-red-600" role="alert">
          {availabilityError}
        </p>
      ) : null}

      {!availabilityPending && !availabilityError ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
          {sections.map((section) => (
            <div key={section.key}>
              {section.title ? (
                <h3 className="border-b border-stone-100 bg-stone-50 px-5 py-2.5 text-xs font-semibold tracking-wide text-stone-500 uppercase">
                  {section.title}
                </h3>
              ) : null}
              <ul className="divide-y divide-stone-100">
                {section.ingredients.map((ingredient) => {
                  const availability = availabilityByIngredientId.get(
                    ingredient.id,
                  );
                  const displayQuantity =
                    availability?.scaledQuantity ?? ingredient.quantity;
                  const displayUnit = availability?.unit ?? ingredient.unit;
                  const checked = checkedIngredientIds.has(ingredient.id);
                  const inputId = `ing-${ingredient.id}`;

                  return (
                    <li
                      key={ingredient.id}
                      className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-stone-50/50"
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        className="recipe-ingredient-checkbox recipe-print-hide h-[22px] w-[22px] shrink-0 cursor-pointer appearance-none rounded-[6px] border-2 border-stone-300 bg-white transition-all checked:border-emerald-500 checked:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
                        checked={checked}
                        onChange={() => onToggleIngredient(ingredient.id)}
                      />
                      <label
                        htmlFor={inputId}
                        className="flex min-w-0 flex-1 cursor-pointer flex-col justify-center"
                      >
                        <span
                          className={cn(
                            "text-base text-stone-800 transition-colors",
                            checked && "text-stone-400 line-through",
                          )}
                        >
                          {ingredientDisplayName(ingredient, availability)}
                        </span>
                        {ingredient.note ? (
                          <span className="text-xs text-stone-400">
                            {ingredient.note}
                          </span>
                        ) : null}
                      </label>
                      <div className="shrink-0 text-right">
                        <span
                          className={cn(
                            "font-bold text-stone-800",
                            checked && "text-stone-400",
                          )}
                          data-testid={`ingredient-qty-${ingredient.id}`}
                        >
                          {formatRecipeIngredientQuantity(
                            displayQuantity,
                            displayUnit,
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="border-t border-stone-100 bg-stone-50 px-5 py-3">
            <p className="text-xs text-stone-500">
              Zaznaczaj składniki podczas przygotowania.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ingredientDisplayName(
  ingredient: Ingredient,
  availability?: Availability,
): string {
  const productName = availability?.productName;
  if (
    productName &&
    productName.toLowerCase() !== ingredient.name.toLowerCase()
  ) {
    return `${ingredient.name} (${productName})`;
  }
  return ingredient.name;
}
