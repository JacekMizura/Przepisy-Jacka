"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useQuery } from "@tanstack/react-query";

import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { formatMoneyMinor, formatNutritionNumber } from "@/lib/format-quantity";
import { formatServings } from "@/lib/recipe-labels";

type RecipeEstimate = components["schemas"]["RecipeEstimateDto"];

type RecipeEstimatePanelProps = {
  kitchenId: string;
  recipeId: string;
  servings: number;
  enabled?: boolean;
};

const MISSING = "Brak danych";

export function RecipeEstimatePanel({
  kitchenId,
  recipeId,
  servings,
  enabled = true,
}: RecipeEstimatePanelProps) {
  const estimateQuery = useQuery({
    queryKey: ["recipe-estimate", kitchenId, recipeId, servings],
    enabled,
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}/estimate",
        {
          params: { path: { kitchenId, recipeId }, query: { servings } },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się policzyć kosztu i makro."),
        );
      }
      return data;
    },
  });

  const estimate: RecipeEstimate | undefined = estimateQuery.data;

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
          Koszt i wartości odżywcze
        </h2>
        <p className="text-xs text-gray-500">
          {formatServings(servings)} ·{" "}
          {estimate?.cost.note ?? "Szacunkowo na podstawie ostatnich zakupów"}
        </p>
      </div>

      {estimateQuery.isPending ? (
        <p className="px-4 py-4 text-sm text-gray-500 sm:px-5">Liczenie…</p>
      ) : null}

      {estimateQuery.isError ? (
        <p className="px-4 py-4 text-sm text-red-600 sm:px-5" role="alert">
          {readApiError(estimateQuery.error)}
        </p>
      ) : null}

      {estimate ? (
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <EstimateStat
              label="Koszt przepisu"
              value={
                estimate.cost.recipeTotalMinor !== null
                  ? formatMoneyMinor(estimate.cost.recipeTotalMinor)
                  : MISSING
              }
            />
            <EstimateStat
              label="Koszt / porcja"
              value={
                estimate.cost.perServingMinor !== null
                  ? formatMoneyMinor(estimate.cost.perServingMinor)
                  : MISSING
              }
            />
            <EstimateStat
              label="kcal / porcja"
              value={
                estimate.nutrition.perServing
                  ? `${formatNutritionNumber(estimate.nutrition.perServing.kcal, 0)} kcal`
                  : MISSING
              }
            />
            <EstimateStat
              label="B / T / W na porcję"
              value={
                estimate.nutrition.perServing
                  ? `${formatNutritionNumber(
                      estimate.nutrition.perServing.proteinGrams,
                    )} / ${formatNutritionNumber(
                      estimate.nutrition.perServing.fatGrams,
                    )} / ${formatNutritionNumber(
                      estimate.nutrition.perServing.carbsGrams,
                    )} g`
                  : MISSING
              }
            />
          </div>

          <div className="space-y-1 text-xs leading-snug text-gray-500">
            <Completeness
              title="Koszt"
              counted={estimate.cost.countedIngredients}
              total={estimate.cost.totalIngredients}
              missingNames={estimate.cost.missingIngredientNames}
            />
            <Completeness
              title="Makro"
              counted={estimate.nutrition.countedIngredients}
              total={estimate.nutrition.totalIngredients}
              missingNames={estimate.nutrition.missingIngredientNames}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EstimateStat({ label, value }: { label: string; value: string }) {
  const isMissing = value === MISSING;
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <p className="text-[11px] tracking-wide text-gray-500 uppercase">
        {label}
      </p>
      <p
        className={
          isMissing
            ? "mt-0.5 text-sm font-medium text-gray-400"
            : "mt-0.5 text-sm font-semibold text-gray-900"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Completeness({
  title,
  counted,
  total,
  missingNames,
}: {
  title: string;
  counted: number;
  total: number;
  missingNames: string[];
}) {
  return (
    <p>
      <span className="font-medium text-gray-600">{title}:</span> wyliczono dla{" "}
      {counted} z {total} składników
      {missingNames.length > 0
        ? `. Brak danych dla: ${missingNames.join(", ")}`
        : ""}
      {counted === 0 ? " — uzupełnij dane produktów w spiżarni." : ""}
    </p>
  );
}
