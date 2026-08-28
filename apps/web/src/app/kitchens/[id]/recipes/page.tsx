"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  BookOpen,
  Clock3,
  Plus,
  Search,
  Settings2,
  Signal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { RecipeCategoriesDialog } from "@/components/recipe-categories-dialog";
import { RecipeCategoryLabels } from "@/components/recipe-category-picker";
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

function parseRecipeFilter(value: string | null): RecipeFilter {
  if (value === "mine" || value === "kitchen" || value === "all") {
    return value;
  }
  return "all";
}

function parseCategoryIds(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export default function RecipesPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="px-4 py-16 text-center text-sm text-gray-500">
            Ładowanie przepisów…
          </div>
        </AppShell>
      }
    >
      <RecipesPageContent />
    </Suspense>
  );
}

function RecipesPageContent() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get("q") ?? "";
  const filter = parseRecipeFilter(searchParams.get("filter"));
  const uncategorized = searchParams.get("uncategorized") === "1";
  const categoriesParam = searchParams.get("categories");
  const selectedCategoryIds = useMemo(
    () => (uncategorized ? [] : parseCategoryIds(categoriesParam)),
    [categoriesParam, uncategorized],
  );
  const [manageOpen, setManageOpen] = useState(false);

  const replaceQuery = useCallback(
    (patch: {
      q?: string;
      filter?: RecipeFilter;
      categories?: string[];
      uncategorized?: boolean;
    }) => {
      const next = new URLSearchParams(searchParams.toString());

      const nextQ = patch.q !== undefined ? patch.q : search;
      const nextFilter = patch.filter !== undefined ? patch.filter : filter;
      const nextUncategorized =
        patch.uncategorized !== undefined ? patch.uncategorized : uncategorized;
      const nextCategories =
        patch.categories !== undefined ? patch.categories : selectedCategoryIds;

      if (nextQ.trim()) {
        next.set("q", nextQ.trim());
      } else {
        next.delete("q");
      }

      if (nextFilter !== "all") {
        next.set("filter", nextFilter);
      } else {
        next.delete("filter");
      }

      if (nextUncategorized) {
        next.set("uncategorized", "1");
        next.delete("categories");
      } else {
        next.delete("uncategorized");
        if (nextCategories.length > 0) {
          next.set("categories", nextCategories.join(","));
        } else {
          next.delete("categories");
        }
      }

      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [
      filter,
      pathname,
      router,
      search,
      searchParams,
      selectedCategoryIds,
      uncategorized,
    ],
  );

  const categoriesQuery = useQuery({
    queryKey: ["recipe-categories", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/recipe-categories",
        { params: { path: { kitchenId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać kategorii."));
      }
      return data ?? [];
    },
  });

  const recipesQuery = useQuery({
    queryKey: [
      "recipes",
      kitchenId,
      filter,
      search.trim(),
      selectedCategoryIds.join(","),
      uncategorized,
    ],
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
              ...(uncategorized ? { uncategorized: true } : {}),
              ...(!uncategorized && selectedCategoryIds.length > 0
                ? { categoryIds: selectedCategoryIds }
                : {}),
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

  const recipes = recipesQuery.data ?? [];
  const hasActiveCategoryFilter =
    uncategorized || selectedCategoryIds.length > 0;
  const hasActiveFilters =
    search.trim().length > 0 || filter !== "all" || hasActiveCategoryFilter;

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categoriesQuery.data ?? []) {
      map.set(category.id, category.name);
    }
    return map;
  }, [categoriesQuery.data]);

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <header className="relative text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Przepisy
          </h1>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:absolute sm:top-0 sm:right-0 sm:mt-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setManageOpen(true)}
            >
              <Settings2 size={16} className="mr-1" />
              Zarządzaj kategoriami
            </Button>
            <Link href={`/kitchens/${kitchenId}/recipes/new`}>
              <Button>
                <Plus size={16} className="mr-1" />
                Nowy przepis
              </Button>
            </Link>
          </div>
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
              onChange={(event) => replaceQuery({ q: event.target.value })}
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
                  onClick={() => replaceQuery({ filter: option.value })}
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

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Kategorie:
              </span>
              <button
                type="button"
                onClick={() =>
                  replaceQuery({ categories: [], uncategorized: false })
                }
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  !hasActiveCategoryFilter
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                )}
              >
                Wszystkie
              </button>
              <button
                type="button"
                onClick={() =>
                  replaceQuery({ categories: [], uncategorized: true })
                }
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  uncategorized
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                )}
              >
                Bez kategorii
              </button>
              {(categoriesQuery.data ?? []).map((category) => {
                const isSelected = selectedCategoryIds.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        replaceQuery({
                          uncategorized: false,
                          categories: selectedCategoryIds.filter(
                            (id) => id !== category.id,
                          ),
                        });
                        return;
                      }
                      replaceQuery({
                        uncategorized: false,
                        categories: [...selectedCategoryIds, category.id],
                      });
                    }}
                    className={cn(
                      "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                      isSelected
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                    )}
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
            {hasActiveCategoryFilter ? (
              <p className="text-center text-xs text-gray-500">
                {uncategorized
                  ? "Wyświetlane są tylko przepisy bez kategorii."
                  : `Filtr OR: ${selectedCategoryIds
                      .map((id) => categoryNameById.get(id) ?? id)
                      .join(", ")}`}
              </p>
            ) : null}
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
          recipes.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <BookOpen size={32} />
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {hasActiveFilters
                  ? "Brak pasujących przepisów"
                  : "Nie masz jeszcze przepisów"}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                {hasActiveFilters
                  ? "Zmień wyszukiwanie lub filtry kategorii, albo wyczyść je i pokaż wszystkie przepisy."
                  : "Utwórz pierwszy przepis, aby śledzić składniki i gotować z zapasów."}
              </p>
              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-6"
                  onClick={() =>
                    replaceQuery({
                      q: "",
                      filter: "all",
                      categories: [],
                      uncategorized: false,
                    })
                  }
                >
                  Wyczyść filtry
                </Button>
              ) : (
                <Link
                  href={`/kitchens/${kitchenId}/recipes/new`}
                  className="mt-6 inline-block"
                >
                  <Button>Dodaj przepis</Button>
                </Link>
              )}
            </div>
          ) : null}

          {!recipesQuery.isPending &&
          !recipesQuery.isError &&
          recipes.length > 0 ? (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recipes.map((recipe) => (
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

      <RecipeCategoriesDialog
        kitchenId={kitchenId}
        open={manageOpen}
        onClose={() => setManageOpen(false)}
      />
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
          <RecipeCategoryLabels categories={recipe.categories ?? []} />
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
