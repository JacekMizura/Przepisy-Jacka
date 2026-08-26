"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  BookOpen,
  Minus,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  AddRecipeGapsDialog,
  availabilityBadgeClass,
} from "@/components/add-recipe-gaps-dialog";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import {
  AVAILABILITY_STATUS_LABELS,
  formatRecipeIngredientQuantity,
  formatRecipeTime,
  formatTotalRecipeTime,
  RECIPE_DIFFICULTY_LABELS,
  RECIPE_VISIBILITY_LABELS,
} from "@/lib/recipe-labels";
import { cn } from "@/lib/utils";

export default function RecipeDetailPage() {
  const params = useParams<{ id: string; recipeId: string }>();
  const kitchenId = params.id;
  const recipeId = params.recipeId;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [servings, setServings] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(false);
  const [gapsFeedback, setGapsFeedback] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET("/api/me");
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać profilu."));
      }
      return data;
    },
  });

  const recipeQuery = useQuery({
    queryKey: ["recipe", kitchenId, recipeId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error, response } = await client.GET(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}",
        { params: { path: { kitchenId, recipeId } } },
      );
      if (response.status === 404) {
        throw new Error("Nie znaleziono przepisu albo nie masz do niego dostępu.");
      }
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać przepisu."));
      }
      return data;
    },
  });

  const activeServings = servings ?? recipeQuery.data?.servings ?? 2;

  const availabilityQuery = useQuery({
    queryKey: ["recipe-availability", kitchenId, recipeId, activeServings],
    enabled: Boolean(recipeQuery.data),
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}/availability",
        {
          params: {
            path: { kitchenId, recipeId },
            query: { servings: activeServings },
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się sprawdzić dostępności składników."),
        );
      }
      return data;
    },
  });

  const deleteRecipe = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { error, response } = await client.DELETE(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}",
        { params: { path: { kitchenId, recipeId } } },
      );
      if (response.status === 403 || response.status === 404) {
        throw new Error("Tylko autor może usunąć ten przepis.");
      }
      if (error) {
        throw new Error(readApiError(error, "Nie udało się usunąć przepisu."));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes", kitchenId] });
      router.push(`/kitchens/${kitchenId}/recipes`);
    },
  });

  const addGaps = useMutation({
    mutationFn: async (includeUnknownIngredientIds: string[]) => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}/add-gaps-to-shopping-list",
        {
          params: { path: { kitchenId, recipeId } },
          body: {
            idempotencyKey: crypto.randomUUID(),
            servings: activeServings,
            includeIngredientIds: includeUnknownIngredientIds,
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się dodać braków do listy zakupów."),
        );
      }
      return data;
    },
    onSuccess: (result) => {
      setGapsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["shopping-list", kitchenId] });
      const addedCount = result?.added.length ?? 0;
      const skippedCount = result?.skipped.length ?? 0;
      if (addedCount === 0 && skippedCount > 0) {
        setGapsFeedback("Nie dodano pozycji — sprawdź podsumowanie i spróbuj ponownie.");
      } else if (addedCount > 0) {
        setGapsFeedback(
          `Dodano ${addedCount} ${addedCount === 1 ? "pozycję" : "pozycje"} do listy zakupów.`,
        );
      } else {
        setGapsFeedback("Brak pozycji do dodania.");
      }
    },
  });

  const recipe = recipeQuery.data;
  const isAuthor = Boolean(
    recipe && meQuery.data && recipe.author.id === meQuery.data.id,
  );

  const availabilityByIngredientId = useMemo(() => {
    const map = new Map<
      string,
      components["schemas"]["RecipeIngredientAvailabilityDto"]
    >();
    for (const entry of availabilityQuery.data?.ingredients ?? []) {
      map.set(entry.ingredientId, entry);
    }
    return map;
  }, [availabilityQuery.data?.ingredients]);

  const hasGaps = useMemo(
    () =>
      (availabilityQuery.data?.ingredients ?? []).some(
        (ingredient) =>
          ingredient.status === "partial" ||
          ingredient.status === "missing" ||
          ingredient.status === "unknown",
      ),
    [availabilityQuery.data?.ingredients],
  );

  function adjustServings(delta: number) {
    const base = recipe?.servings ?? 1;
    setServings((current) => {
      const next = (current ?? base) + delta;
      return Math.max(1, next);
    });
  }

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        {recipeQuery.isPending ? (
          <div className="rounded-3xl border border-gray-100 bg-white p-12 text-center text-sm text-gray-500 shadow-sm">
            Ładowanie przepisu…
          </div>
        ) : null}

        {recipeQuery.isError ? (
          <div
            className="rounded-3xl border border-red-100 bg-white p-12 text-center text-sm text-red-600 shadow-sm"
            role="alert"
          >
            {readApiError(recipeQuery.error)}
          </div>
        ) : null}

        {recipe ? (
          <>
            <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <BookOpen size={32} />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                    {recipe.name}
                  </h1>
                  {recipe.description ? (
                    <p className="mt-2 max-w-2xl text-gray-600">
                      {recipe.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      {RECIPE_VISIBILITY_LABELS[recipe.visibility]}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {RECIPE_DIFFICULTY_LABELS[recipe.difficulty]}
                    </span>
                    {recipe.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {isAuthor ? (
                  <>
                    <Link href={`/kitchens/${kitchenId}/recipes/${recipeId}/edit`}>
                      <Button variant="outline" size="sm">
                        <Pencil size={14} className="mr-1" />
                        Edytuj
                      </Button>
                    </Link>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 size={14} className="mr-1" />
                      Usuń
                    </Button>
                  </>
                ) : null}
                {hasGaps ? (
                  <Button size="sm" onClick={() => setGapsOpen(true)}>
                    <ShoppingCart size={14} className="mr-1" />
                    Dodaj braki do listy
                  </Button>
                ) : null}
              </div>
            </header>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <InfoCard label="Porcje (bazowo)" value={String(recipe.servings)} />
              <InfoCard
                label="Przygotowanie"
                value={formatRecipeTime(recipe.prepTimeMinutes)}
              />
              <InfoCard
                label="Gotowanie"
                value={formatRecipeTime(recipe.cookTimeMinutes)}
              />
              <InfoCard
                label="Łącznie"
                value={formatTotalRecipeTime(
                  recipe.prepTimeMinutes,
                  recipe.cookTimeMinutes,
                )}
              />
            </section>

            <p className="text-sm text-gray-500">
              Autor: {recipe.author.name} · Utworzono{" "}
              {new Date(recipe.createdAt).toLocaleDateString("pl-PL")}
            </p>

            <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Składniki</h2>
                  <p className="text-sm text-gray-500">
                    Dla {activeServings}{" "}
                    {activeServings === 1 ? "porcji" : "porcji"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => adjustServings(-1)}
                    disabled={activeServings <= 1}
                    aria-label="Zmniejsz liczbę porcji"
                  >
                    <Minus size={14} />
                  </Button>
                  <span className="min-w-8 text-center text-sm font-semibold text-gray-900">
                    {activeServings}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => adjustServings(1)}
                    aria-label="Zwiększ liczbę porcji"
                  >
                    <Plus size={14} />
                  </Button>
                </div>
              </div>

              {availabilityQuery.isPending ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  Sprawdzanie dostępności…
                </div>
              ) : null}

              {availabilityQuery.isError ? (
                <div className="p-8 text-center text-sm text-red-600" role="alert">
                  {readApiError(availabilityQuery.error)}
                </div>
              ) : null}

              {!availabilityQuery.isPending && !availabilityQuery.isError ? (
                <ul className="divide-y divide-gray-100">
                  {recipe.ingredients
                    .slice()
                    .sort((left, right) => left.sortOrder - right.sortOrder)
                    .map((ingredient) => {
                      const availability = availabilityByIngredientId.get(
                        ingredient.id,
                      );
                      const displayQuantity =
                        availability?.scaledQuantity ?? ingredient.quantity;
                      const displayUnit = availability?.unit ?? ingredient.unit;

                      return (
                        <li
                          key={ingredient.id}
                          className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {ingredient.name}
                              {availability?.productName ? (
                                <span className="ml-2 text-sm font-normal text-gray-500">
                                  ({availability.productName})
                                </span>
                              ) : null}
                            </p>
                            <p className="text-sm text-gray-600">
                              {formatRecipeIngredientQuantity(
                                displayQuantity,
                                displayUnit,
                              )}
                            </p>
                            {ingredient.note ? (
                              <p className="mt-1 text-sm text-gray-500">
                                {ingredient.note}
                              </p>
                            ) : null}
                          </div>
                          {availability ? (
                            <div className="flex flex-col items-start gap-1 sm:items-end">
                              <span
                                className={availabilityBadgeClass(availability.status)}
                              >
                                {AVAILABILITY_STATUS_LABELS[availability.status]}
                              </span>
                              {availability.status === "unknown" ? (
                                <span className="text-xs text-gray-500">
                                  Nie można automatycznie ocenić
                                </span>
                              ) : null}
                              {availability.availableQuantity ? (
                                <span className="text-xs text-gray-500">
                                  W zapasach: {availability.availableQuantity}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                </ul>
              ) : null}
            </section>

            <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-lg font-bold text-gray-900">
                  Sposób przygotowania
                </h2>
              </div>
              <ol className="divide-y divide-gray-100">
                {recipe.steps
                  .slice()
                  .sort((left, right) => left.sortOrder - right.sortOrder)
                  .map((step, index) => (
                    <li key={step.id} className="flex gap-4 px-5 py-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700">
                        {index + 1}
                      </span>
                      <p className="text-gray-800">{step.instruction}</p>
                    </li>
                  ))}
              </ol>
            </section>

            {gapsFeedback ? (
              <div
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm",
                  gapsFeedback.includes("Dodano")
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-900",
                )}
              >
                {gapsFeedback}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {deleteOpen && recipe ? (
        <ConfirmDialog
          title={`Usunąć „${recipe.name}”?`}
          description="Przepis zostanie trwale usunięty. Tej operacji nie można cofnąć."
          confirmLabel="Usuń"
          pending={deleteRecipe.isPending}
          onConfirm={() => deleteRecipe.mutate()}
          onCancel={() => {
            if (!deleteRecipe.isPending) {
              setDeleteOpen(false);
            }
          }}
        />
      ) : null}

      {deleteRecipe.isError ? (
        <div className="fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-600 shadow-lg">
          {readApiError(deleteRecipe.error)}
        </div>
      ) : null}

      {gapsOpen && availabilityQuery.data ? (
        <AddRecipeGapsDialog
          recipeName={recipe?.name ?? "Przepis"}
          servings={activeServings}
          ingredients={availabilityQuery.data.ingredients}
          pending={addGaps.isPending}
          onCancel={() => {
            if (!addGaps.isPending) {
              setGapsOpen(false);
            }
          }}
          onConfirm={(includeUnknownIngredientIds) =>
            addGaps.mutate(includeUnknownIngredientIds)
          }
        />
      ) : null}

      {addGaps.isError ? (
        <div className="fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-600 shadow-lg">
          {readApiError(addGaps.error)}
        </div>
      ) : null}
    </AppShell>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}
