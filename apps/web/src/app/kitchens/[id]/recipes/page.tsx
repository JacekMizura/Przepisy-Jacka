"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  BookOpen,
  Clock3,
  Plus,
  Search,
  Signal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { mediaDisplayUrl } from "@/lib/media-upload";
import {
  formatServings,
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
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <header className="relative text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Przepisy
          </h1>
          <Link
            href={`/kitchens/${kitchenId}/recipes/new`}
            className="mt-4 inline-flex sm:absolute sm:top-0 sm:right-0 sm:mt-0"
          >
            <Button>
              <Plus size={16} className="mr-1" />
              Nowy przepis
            </Button>
          </Link>
        </header>

        <section className="space-y-5">
          <div className="relative mx-auto max-w-xl">
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

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-6 sm:gap-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Pokaż:
              </span>
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                    filter === option.value
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {recipesQuery.isPending ? (
            <div className="py-16 text-center text-sm text-gray-500">
              Ładowanie przepisów…
            </div>
          ) : null}

          {recipesQuery.isError ? (
            <div className="py-16 text-center text-sm text-red-600" role="alert">
              {readApiError(recipesQuery.error)}
            </div>
          ) : null}

          {!recipesQuery.isPending &&
          !recipesQuery.isError &&
          filteredRecipes.length === 0 ? (
            <div className="px-6 py-16 text-center">
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
                <Link
                  href={`/kitchens/${kitchenId}/recipes/new`}
                  className="mt-6 inline-block"
                >
                  <Button>Dodaj przepis</Button>
                </Link>
              ) : null}
            </div>
          ) : null}

          {!recipesQuery.isPending &&
          !recipesQuery.isError &&
          filteredRecipes.length > 0 ? (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRecipes.map((recipe) => (
                <RecipeTile
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

function RecipeTile({
  kitchenId,
  recipe,
}: {
  kitchenId: string;
  recipe: RecipeSummary;
}) {
  const cover = mediaDisplayUrl(recipe.coverImage, "full");
  const timeLabel = formatTotalRecipeTime(
    recipe.prepTimeMinutes,
    recipe.cookTimeMinutes,
  );
  const difficultyLabel = RECIPE_DIFFICULTY_LABELS[recipe.difficulty];
  const servingsLabel = formatServings(recipe.servings);

  return (
    <li>
      <Link
        href={`/kitchens/${kitchenId}/recipes/${recipe.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex min-h-[4.5rem] flex-col justify-center gap-1 px-4 py-4 text-center sm:min-h-[5rem] sm:px-5">
          <p className="line-clamp-2 text-base font-bold leading-snug text-gray-900 sm:text-[1.05rem]">
            {recipe.name}
          </p>
          <p className="text-xs text-gray-500">
            {RECIPE_VISIBILITY_LABELS[recipe.visibility]}
            <span className="mx-1.5 text-gray-300" aria-hidden>
              ·
            </span>
            {recipe.author.name}
          </p>
        </div>

        <div className="relative aspect-square w-full overflow-hidden bg-emerald-50/70">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <BookOpen size={40} className="text-emerald-300" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-200/80 border-t border-gray-100 bg-gray-50 text-gray-600">
          <MetaCell
            icon={<Clock3 size={14} strokeWidth={2} aria-hidden />}
            label={timeLabel}
          />
          <MetaCell
            icon={<Signal size={14} strokeWidth={2} aria-hidden />}
            label={difficultyLabel}
          />
          <MetaCell
            icon={<Users size={14} strokeWidth={2} aria-hidden />}
            label={servingsLabel}
          />
        </div>
      </Link>
    </li>
  );
}

function MetaCell({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 px-1.5 py-2.5 text-[11px] font-medium sm:text-xs">
      <span className="shrink-0 text-emerald-700">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}
