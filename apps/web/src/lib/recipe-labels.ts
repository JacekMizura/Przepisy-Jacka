import type { components } from "@moja-kuchnia/api-client";

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
  piece: "szt",
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
  available: "Wystarczy",
  partial: "Częściowo",
  missing: "Brak",
  unknown: "Nieznane",
};

export function formatRecipeIngredientQuantity(
  quantity: string | null | undefined,
  unit: RecipeIngredientUnit,
): string {
  if (unit === "to_taste") {
    return "do smaku";
  }
  if (!quantity) {
    return RECIPE_INGREDIENT_UNIT_LABELS[unit];
  }
  return `${quantity} ${RECIPE_INGREDIENT_UNIT_LABELS[unit]}`;
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
