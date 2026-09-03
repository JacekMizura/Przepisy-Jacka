"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ArrowRight, AlertCircle } from "lucide-react";
import Link from "next/link";
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

  if (estimateQuery.isPending) {
    return (
      <p className="mb-8 text-sm text-stone-500" data-testid="recipe-estimate-loading">
        Liczenie kosztu i wartości odżywczych…
      </p>
    );
  }

  if (estimateQuery.isError) {
    return (
      <p className="mb-8 text-sm text-red-600" role="alert">
        {readApiError(estimateQuery.error)}
      </p>
    );
  }

  const estimate = estimateQuery.data;
  if (!estimate) {
    return null;
  }

  const costIncomplete = !estimate.cost.isComplete;
  const nutritionIncomplete = !estimate.nutrition.isComplete;
  const showWarning = costIncomplete || nutritionIncomplete;

  if (showWarning) {
    return (
      <WarningBanner
        kitchenId={kitchenId}
        estimate={estimate}
        costIncomplete={costIncomplete}
        nutritionIncomplete={nutritionIncomplete}
      />
    );
  }

  return (
    <div
      className="mb-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] sm:p-5"
      data-testid="recipe-estimate-summary"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-stone-900">
          Koszt i wartości odżywcze
        </h2>
        <p className="text-xs text-stone-500">
          {formatServings(servings)}
          {estimate.cost.note ? ` · ${estimate.cost.note}` : ""}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Koszt przepisu"
          value={
            estimate.cost.recipeTotalMinor != null
              ? formatMoneyMinor(estimate.cost.recipeTotalMinor)
              : "—"
          }
        />
        <Stat
          label="Koszt / porcja"
          value={
            estimate.cost.perServingMinor != null
              ? formatMoneyMinor(estimate.cost.perServingMinor)
              : "—"
          }
        />
        <Stat
          label="kcal / porcja"
          value={
            estimate.nutrition.perServing
              ? `${formatNutritionNumber(estimate.nutrition.perServing.kcal, 0)} kcal`
              : "—"
          }
        />
        <Stat
          label="B / T / W"
          value={
            estimate.nutrition.perServing
              ? `${formatNutritionNumber(estimate.nutrition.perServing.proteinGrams)} / ${formatNutritionNumber(estimate.nutrition.perServing.fatGrams)} / ${formatNutritionNumber(estimate.nutrition.perServing.carbsGrams)} g`
              : "—"
          }
        />
      </div>
    </div>
  );
}

function WarningBanner({
  kitchenId,
  estimate,
  costIncomplete,
  nutritionIncomplete,
}: {
  kitchenId: string;
  estimate: RecipeEstimate;
  costIncomplete: boolean;
  nutritionIncomplete: boolean;
}) {
  const primary = costIncomplete ? estimate.cost : estimate.nutrition;
  const missing = Array.from(
    new Set([
      ...estimate.cost.missingIngredientNames,
      ...estimate.nutrition.missingIngredientNames,
    ]),
  );
  const preview = missing.slice(0, 6);
  const topics: string[] = [];
  if (costIncomplete) {
    topics.push("kosztorysu");
  }
  if (nutritionIncomplete) {
    topics.push("kalorii i makroskładników");
  }

  return (
    <div
      className="mb-8 flex flex-col items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm lg:flex-row lg:p-5"
      data-testid="recipe-estimate-warning"
      role="status"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
        <AlertCircle className="text-amber-600" size={20} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="mb-1 font-semibold text-amber-900">
          Brakuje danych do pełnego {topics.join(" oraz ")}
        </h4>
        <p className="text-sm leading-relaxed text-amber-800/80">
          Wyliczono wartości dla{" "}
          <strong>
            {primary.countedIngredients} z {primary.totalIngredients}
          </strong>{" "}
          składników
          {preview.length > 0 ? (
            <>
              . Brak danych m.in. dla:{" "}
              <span className="italic">{preview.join(", ")}</span>
              {missing.length > preview.length
                ? ` (+${missing.length - preview.length})`
                : ""}
            </>
          ) : (
            "."
          )}{" "}
          Uzupełnij dane produktów w spiżarni, aby poznać dokładny koszt oraz
          wartości odżywcze.
        </p>
        <Link
          href={`/kitchens/${kitchenId}/stock?view=catalog`}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-amber-700 transition-colors hover:text-amber-900"
        >
          Uzupełnij braki w spiżarni
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-[0.14em] text-stone-500 uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-base font-semibold text-stone-900">{value}</p>
    </div>
  );
}
