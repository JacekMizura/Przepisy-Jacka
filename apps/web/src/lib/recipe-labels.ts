import type { components } from "@moja-kuchnia/api-client";

import { formatQuantityWithUnit } from "@/lib/format-quantity";

type RecipeDifficulty = components["schemas"]["RecipeSummaryDto"]["difficulty"];
type RecipeVisibility = components["schemas"]["RecipeSummaryDto"]["visibility"];
type RecipeIngredientUnit =
  components["schemas"]["RecipeIngredientDto"]["unit"];
type IngredientAvailabilityStatus =
  components["schemas"]["RecipeIngredientAvailabilityDto"]["status"];

export const RECIPE_DIFFICULTY_LABELS: Record<RecipeDifficulty, string> = {
  easy: "Łatwy",
  medium: "Średni",
  hard: "Trudny",
};

export const RECIPE_VISIBILITY_LABELS: Record<RecipeVisibility, string> = {
  private: "Prywatny",
  kitchen: "Udostępniony kuchni",
};

export const RECIPE_INGREDIENT_UNIT_LABELS: Record<
  RecipeIngredientUnit,
  string
> = {
  piece: "szt.",
  gram: "g",
  kilogram: "kg",
  milliliter: "ml",
  liter: "l",
  teaspoon: "łyżeczka",
  tablespoon: "łyżka",
  cup: "szklanka",
  pinch: "szczypta",
  package: "opakowanie",
  to_taste: "do smaku",
};

export const AVAILABILITY_STATUS_LABELS: Record<
  IngredientAvailabilityStatus,
  string
> = {
  available: "Masz wszystko",
  partial: "Częściowo",
  missing: "Brak",
  unknown: "Nieznane",
};

export function formatRecipeIngredientQuantity(
  quantity: string | null | undefined,
  unit: RecipeIngredientUnit,
): string {
  return formatQuantityWithUnit(quantity, unit);
}

/** Polska odmiana: 1 porcja, 2 porcje, 5 porcji. */
export function formatServings(count: number): string {
  const rest10 = count % 10;
  const rest100 = count % 100;
  if (count === 1) {
    return "1 porcja";
  }
  if (rest10 >= 2 && rest10 <= 4 && (rest100 < 12 || rest100 > 14)) {
    return `${count} porcje`;
  }
  return `${count} porcji`;
}

export function formatRecipeTime(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) {
    return "—";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${rest} min`;
}

export function formatTotalRecipeTime(
  prep: number | null | undefined,
  cook: number | null | undefined,
): string {
  const total = (prep ?? 0) + (cook ?? 0);
  if (total <= 0) {
    return "—";
  }
  return formatRecipeTime(total);
}
