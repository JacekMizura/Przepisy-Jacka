"use client";

import type { components } from "@moja-kuchnia/api-client";
import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";

import { availabilityBadgeClass } from "@/components/add-recipe-gaps-dialog";
import { Button } from "@/components/ui/button";
import { formatQuantityWithUnit } from "@/lib/format-quantity";
import {
  buildIngredientClipboardSections,
  formatRecipeClipboardText,
  type RecipeClipboardIngredient,
} from "@/lib/recipe-clipboard";
import {
  AVAILABILITY_STATUS_LABELS,
  formatRecipeIngredientQuantity,
} from "@/lib/recipe-labels";
import { cn } from "@/lib/utils";

type Ingredient = components["schemas"]["RecipeIngredientDto"];
type IngredientGroup = components["schemas"]["RecipeIngredientGroupDto"];
type Step = components["schemas"]["RecipeStepDto"];
type Availability =
  components["schemas"]["RecipeIngredientAvailabilityDto"];

type RecipeIngredientsPanelProps = {
  ingredients: Ingredient[];
  ingredientGroups?: IngredientGroup[];
  steps?: Step[];
  availabilityByIngredientId: Map<string, Availability>;
  checkedIngredientIds: Set<string>;
  availabilityPending: boolean;
  availabilityError: string | null;
  onToggleIngredient: (id: string) => void;
};

export function RecipeIngredientsPanel({
  ingredients,
  ingredientGroups = [],
  steps = [],
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

  async function copyRecipe() {
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
    const text = formatRecipeClipboardText({
      ingredients: clipboardIngredients,
      ingredientGroups,
      steps,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="recipe-ingredients-panel lg:sticky lg:top-6 lg:self-start">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl tracking-tight text-stone-900">
            Składniki
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Ilości przeliczone na wybrane porcje.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="recipe-print-hide shrink-0"
          onClick={() => void copyRecipe()}
          aria-label="Kopiuj przepis (składniki i kroki)"
        >
          {copied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
          {copied ? "Skopiowano" : "Kopiuj"}
        </Button>
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
        <div className="border-t border-stone-200/80">
          {sections.map((section) => (
            <div key={section.key}>
              {section.title ? (
                <h3 className="pt-4 pb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
                  {section.title}
                </h3>
              ) : null}
              <ul className="divide-y divide-stone-200/80">
                {section.ingredients.map((ingredient) => {
                  const availability = availabilityByIngredientId.get(
                    ingredient.id,
                  );
                  const displayQuantity =
                    availability?.scaledQuantity ?? ingredient.quantity;
                  const displayUnit = availability?.unit ?? ingredient.unit;
                  const hint = availability
                    ? availabilityHint(availability)
                    : null;
                  const checked = checkedIngredientIds.has(ingredient.id);

                  return (
                    <li
                      key={ingredient.id}
                      className={cn(
                        "flex gap-3 py-3.5",
                        checked && "opacity-70",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="recipe-print-hide mt-1 h-5 w-5 shrink-0 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
                        checked={checked}
                        onChange={() => onToggleIngredient(ingredient.id)}
                        aria-label={`Oznacz ${ingredient.name} jako przygotowane`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "text-[15px] leading-snug text-stone-900",
                                checked && "text-stone-500 line-through",
                              )}
                            >
                              <span className="font-medium">
                                {ingredientDisplayName(ingredient, availability)}
                              </span>{" "}
                              <span
                                className={cn(
                                  "text-stone-600",
                                  checked && "text-stone-400",
                                )}
                              >
                                {formatRecipeIngredientQuantity(
                                  displayQuantity,
                                  displayUnit,
                                )}
                              </span>
                            </p>
                            {ingredient.note ? (
                              <p className="mt-0.5 text-xs text-stone-500">
                                {ingredient.note}
                              </p>
                            ) : null}
                            {hint ? (
                              <p className="recipe-print-hide mt-1 text-xs leading-snug text-stone-500">
                                {hint}
                              </p>
                            ) : null}
                          </div>
                          {availability ? (
                            <span
                              className={cn(
                                "recipe-print-hide shrink-0 whitespace-nowrap",
                                availabilityBadgeClass(availability.status),
                              )}
                            >
                              {AVAILABILITY_STATUS_LABELS[availability.status]}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
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

function availabilityHint(availability: Availability): string | null {
  const have = availability.availableQuantity
    ? formatQuantityWithUnit(
        availability.availableQuantity,
        availability.availableUnit,
      )
    : "0";
  const need = formatRecipeIngredientQuantity(
    availability.scaledQuantity,
    availability.unit,
  );
  if (availability.status === "available") {
    return `Masz ${have} / potrzeba ${need}`;
  }
  if (availability.status === "partial" || availability.status === "missing") {
    const gap = availability.gapQuantity
      ? formatQuantityWithUnit(availability.gapQuantity, availability.gapUnit)
      : need;
    return `Masz ${have} / potrzeba ${need}, brakuje ${gap}`;
  }
  return null;
}
