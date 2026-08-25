"use client";

import type { components } from "@moja-kuchnia/api-client";
import { BookOpen, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import {
  formatTotalRecipeTime,
  RECIPE_DIFFICULTY_LABELS,
  RECIPE_VISIBILITY_LABELS,
} from "@/lib/recipe-labels";
import { cn } from "@/lib/utils";

type RecipeSummary = components["schemas"]["RecipeSummaryDto"];
type RecipeFilter = "all" | "mine" | "kitchen";

const FILTER_OPTIONS: Array<{ value: RecipeFilter; label: string }> = [
  { value: "all", label: "Wszystkie" },
  { value: "mine", label: "Moje" },
  { value: "kitchen", label: "Udostępnione kuchni" },
];

export default function RecipesPage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RecipeFilter>("all");

  const recipesQuery = useQuery({
    queryKey: ["recipes", kitchenId, filter, search.trim()],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error, response } = await client.GET(
        "/api/kitchens/{kitchenId}/recipes",
        {
          params: {
            path: { kitchenId },
            query: {
              filter,
              ...(search.trim() ? { search: search.trim() } : {}),
            },
          },
        },
      );
      if (response.status === 404) {
        throw new Error("Nie znaleziono kuchni albo nie masz do niej dostępu.");
      }
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać przepisów."));
      }
      return data ?? [];
    },
  });

  const filteredRecipes = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const items = recipesQuery.data ?? [];
    if (!needle) {
      return items;
    }
    return items.filter((recipe) =>
      recipe.name.toLowerCase().includes(needle),
    );
  }, [recipesQuery.data, search]);

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Przepisy
            </h1>
            <p className="mt-2 text-gray-500">
              Zapisuj przepisy, sprawdzaj dostępność składników i dodawaj braki
              do listy zakupów.
            </p>
          </div>
          <Link href={`/kitchens/${kitchenId}/recipes/new`}>
            <Button>
              <Plus size={16} className="mr-1" />
              Nowy przepis
            </Button>
          </Link>
        </header>

        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="space-y-4 border-b border-gray-100 p-5">
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
              />
              <Input
                aria-label="Szukaj przepisów"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Szukaj po nazwie…"
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={filter === option.value ? "default" : "outline"}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {recipesQuery.isPending ? (
            <div className="p-12 text-center text-sm text-gray-500">
              Ładowanie przepisów…
            </div>
          ) : null}

          {recipesQuery.isError ? (
            <div className="p-12 text-center text-sm text-red-600" role="alert">
              {readApiError(recipesQuery.error)}
            </div>
          ) : null}

          {!recipesQuery.isPending &&
          !recipesQuery.isError &&
          filteredRecipes.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <BookOpen size={32} />
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {search.trim() || filter !== "all"
                  ? "Brak pasujących przepisów"
                  : "Nie masz jeszcze przepisów"}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                {search.trim() || filter !== "all"
                  ? "Spróbuj zmienić filtr albo wyszukiwanie."
                  : "Utwórz pierwszy przepis, aby śledzić składniki i gotować z zapasów."}
              </p>
              {!search.trim() && filter === "all" ? (
                <Link href={`/kitchens/${kitchenId}/recipes/new`} className="mt-6 inline-block">
                  <Button>Dodaj przepis</Button>
                </Link>
              ) : null}
            </div>
          ) : null}

          {!recipesQuery.isPending &&
          !recipesQuery.isError &&
          filteredRecipes.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {filteredRecipes.map((recipe) => (
                <RecipeListItem
                  key={recipe.id}
                  kitchenId={kitchenId}
                  recipe={recipe}
                />
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

function RecipeListItem({
  kitchenId,
  recipe,
}: {
  kitchenId: string;
  recipe: RecipeSummary;
}) {
  return (
    <li>
      <Link
        href={`/kitchens/${kitchenId}/recipes/${recipe.id}`}
        className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-emerald-50/40 sm:flex-row sm:items-center"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <BookOpen size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-gray-900">{recipe.name}</p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                recipe.visibility === "private"
                  ? "bg-gray-100 text-gray-600"
                  : "bg-emerald-50 text-emerald-800",
              )}
            >
              {RECIPE_VISIBILITY_LABELS[recipe.visibility]}
            </span>
          </div>
          {recipe.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">
              {recipe.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>{recipe.servings} porcji</span>
            <span>{RECIPE_DIFFICULTY_LABELS[recipe.difficulty]}</span>
            <span>
              {formatTotalRecipeTime(
                recipe.prepTimeMinutes,
                recipe.cookTimeMinutes,
              )}
            </span>
            <span>Autor: {recipe.author.name}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
