"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  BookOpen,
  Minus,
  MoreVertical,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  AddRecipeGapsDialog,
  availabilityBadgeClass,
} from "@/components/add-recipe-gaps-dialog";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { formatQuantityWithUnit } from "@/lib/format-quantity";
import {
  formatRecipeIngredientQuantity,
  formatRecipeTime,
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
  const menuRef = useRef<HTMLDivElement>(null);

  const [servings, setServings] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(
    () => new Set(),
  );
  const [doneSteps, setDoneSteps] = useState<Set<string>>(() => new Set());

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
    mutationFn: async (
      selections: components["schemas"]["RecipeGapSelectionDto"][],
    ) => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}/add-gaps-to-shopping-list",
        {
          params: { path: { kitchenId, recipeId } },
          body: {
            idempotencyKey: crypto.randomUUID(),
            servings: activeServings,
            selections,
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
      if (addedCount > 0) {
        setToast(
          `Dodano ${addedCount} ${addedCount === 1 ? "pozycję" : "pozycje"} do listy zakupów.`,
        );
      } else {
        setToast("Nie dodano pozycji — sprawdź wybór i spróbuj ponownie.");
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
    setServings((current) => Math.max(1, (current ?? base) + delta));
  }

  function toggleIngredient(id: string) {
    setCheckedIngredients((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleStep(id: string) {
    setDoneSteps((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function ingredientDisplayName(
    ingredient: components["schemas"]["RecipeIngredientDto"],
    availability?: components["schemas"]["RecipeIngredientAvailabilityDto"],
  ): string {
    const productName = availability?.productName;
    if (productName && productName.toLowerCase() !== ingredient.name.toLowerCase()) {
      return `${ingredient.name} · ${productName}`;
    }
    return ingredient.name;
  }

  function availabilityHint(
    availability: components["schemas"]["RecipeIngredientAvailabilityDto"],
  ): string | null {
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
      return `Masz ${have} / potrzeba ${need} · brakuje ${gap}`;
    }
    return null;
  }

  return (
    <AppShell kitchenId={kitchenId}>
      <article className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        {recipeQuery.isPending ? (
          <p className="text-center text-sm text-gray-500">Ładowanie przepisu…</p>
        ) : null}

        {recipeQuery.isError ? (
          <p className="text-center text-sm text-red-600" role="alert">
            {readApiError(recipeQuery.error)}
          </p>
        ) : null}

        {recipe ? (
          <>
            <header className="mb-6 border-b border-gray-100 pb-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                    {recipe.name}
                  </h1>
                  {recipe.description ? (
                    <p className="mt-2 text-base leading-relaxed text-gray-600">
                      {recipe.description}
                    </p>
                  ) : null}
                </div>
                <div className="relative shrink-0" ref={menuRef}>
                  {isAuthor ? (
                    <>
                      <button
                        type="button"
                        aria-label="Więcej akcji"
                        aria-expanded={menuOpen}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                        onClick={() => setMenuOpen((open) => !open)}
                      >
                        <MoreVertical size={20} />
                      </button>
                      {menuOpen ? (
                        <div className="absolute right-0 z-10 mt-1 w-44 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                            onClick={() => {
                              setMenuOpen(false);
                              setDeleteOpen(true);
                            }}
                          >
                            <Trash2 size={14} />
                            Usuń przepis
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  {RECIPE_VISIBILITY_LABELS[recipe.visibility]}
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {RECIPE_DIFFICULTY_LABELS[recipe.difficulty]}
                </span>
                {recipe.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <p className="text-sm text-gray-500">
                {recipe.author.name}
                {" · "}
                {new Date(recipe.createdAt).toLocaleDateString("pl-PL")}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {hasGaps ? (
                  <Button onClick={() => setGapsOpen(true)}>
                    <ShoppingCart size={16} className="mr-1.5" />
                    Dodaj braki do listy
                  </Button>
                ) : null}
                {isAuthor ? (
                  <Link href={`/kitchens/${kitchenId}/recipes/${recipeId}/edit`}>
                    <Button variant="outline">
                      <Pencil size={16} className="mr-1.5" />
                      Edytuj
                    </Button>
                  </Link>
                ) : null}
              </div>
            </header>

            <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Porcje</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => adjustServings(-1)}
                  disabled={activeServings <= 1}
                  aria-label="Zmniejsz liczbę porcji"
                >
                  <Minus size={14} />
                </Button>
                <span className="min-w-6 text-center font-semibold text-gray-900">
                  {activeServings}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => adjustServings(1)}
                  aria-label="Zwiększ liczbę porcji"
                >
                  <Plus size={14} />
                </Button>
              </div>
              <span className="text-gray-400">·</span>
              <span>
                <span className="text-gray-500">Przygotowanie </span>
                <span className="font-medium text-gray-900">
                  {formatRecipeTime(recipe.prepTimeMinutes)}
                </span>
              </span>
              <span className="text-gray-400">·</span>
              <span>
                <span className="text-gray-500">Gotowanie </span>
                <span className="font-medium text-gray-900">
                  {formatRecipeTime(recipe.cookTimeMinutes)}
                </span>
              </span>
              <span className="text-gray-400">·</span>
              <span>
                <span className="text-gray-500">Trudność </span>
                <span className="font-medium text-gray-900">
                  {RECIPE_DIFFICULTY_LABELS[recipe.difficulty]}
                </span>
              </span>
            </div>

            <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
              <section>
                <h2 className="mb-4 text-lg font-semibold text-gray-900">
                  Składniki
                </h2>

                {availabilityQuery.isPending ? (
                  <p className="text-sm text-gray-500">Sprawdzanie zapasów…</p>
                ) : null}
                {availabilityQuery.isError ? (
                  <p className="text-sm text-red-600" role="alert">
                    {readApiError(availabilityQuery.error)}
                  </p>
                ) : null}

                {!availabilityQuery.isPending && !availabilityQuery.isError ? (
                  <ul className="space-y-1">
                    {recipe.ingredients
                      .slice()
                      .sort((left, right) => left.sortOrder - right.sortOrder)
                      .map((ingredient) => {
                        const availability = availabilityByIngredientId.get(
                          ingredient.id,
                        );
                        const displayQuantity =
                          availability?.scaledQuantity ?? ingredient.quantity;
                        const displayUnit =
                          availability?.unit ?? ingredient.unit;
                        const hint = availability
                          ? availabilityHint(availability)
                          : null;

                        return (
                          <li
                            key={ingredient.id}
                            className={cn(
                              "group flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-gray-50",
                              checkedIngredients.has(ingredient.id) &&
                                "opacity-60",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 shrink-0"
                              checked={checkedIngredients.has(ingredient.id)}
                              onChange={() => toggleIngredient(ingredient.id)}
                              aria-label={`Oznacz ${ingredient.name} jako przygotowane`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span
                                  className={cn(
                                    "font-medium text-gray-900",
                                    checkedIngredients.has(ingredient.id) &&
                                      "line-through",
                                  )}
                                >
                                  {ingredientDisplayName(
                                    ingredient,
                                    availability,
                                  )}
                                </span>
                                <span className="text-sm text-gray-600">
                                  {formatRecipeIngredientQuantity(
                                    displayQuantity,
                                    displayUnit,
                                  )}
                                </span>
                              </div>
                              {ingredient.note ? (
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {ingredient.note}
                                </p>
                              ) : null}
                              {hint ? (
                                <p className="mt-1 text-xs text-gray-500">
                                  {hint}
                                  {availability ? (
                                    <span
                                      className={cn(
                                        "ml-2",
                                        availabilityBadgeClass(
                                          availability.status,
                                        ),
                                      )}
                                    >
                                      {availability.status === "available"
                                        ? "OK"
                                        : availability.status === "partial"
                                          ? "Częściowo"
                                          : availability.status === "missing"
                                            ? "Brak"
                                            : "?"}
                                    </span>
                                  ) : null}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                ) : null}
              </section>

              <section>
                <h2 className="mb-4 text-lg font-semibold text-gray-900">
                  Przygotowanie
                </h2>
                <ol className="space-y-4">
                  {recipe.steps
                    .slice()
                    .sort((left, right) => left.sortOrder - right.sortOrder)
                    .map((step, index) => (
                      <li
                        key={step.id}
                        className={cn(
                          "flex gap-3",
                          doneSteps.has(step.id) && "opacity-60",
                        )}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700">
                            {index + 1}
                          </span>
                          <input
                            type="checkbox"
                            checked={doneSteps.has(step.id)}
                            onChange={() => toggleStep(step.id)}
                            aria-label={`Krok ${index + 1} wykonany`}
                            className="mt-1"
                          />
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          {step.title ? (
                            <p
                              className={cn(
                                "font-medium text-gray-900",
                                doneSteps.has(step.id) && "line-through",
                              )}
                            >
                              {step.title}
                            </p>
                          ) : null}
                          <p
                            className={cn(
                              "text-gray-800 leading-relaxed",
                              step.title ? "mt-1" : "",
                              doneSteps.has(step.id) && "line-through",
                            )}
                          >
                            {step.instruction}
                          </p>
                          {step.durationMinutes ? (
                            <p className="mt-1.5 text-xs text-gray-500">
                              {formatRecipeTime(step.durationMinutes)}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                </ol>
              </section>
            </div>
          </>
        ) : null}

        {!recipe && !recipeQuery.isPending && !recipeQuery.isError ? (
          <div className="text-center">
            <BookOpen size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">Nie znaleziono przepisu.</p>
          </div>
        ) : null}
      </article>

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
          onConfirm={(selections) => addGaps.mutate(selections)}
        />
      ) : null}

      <Toast
        message={toast}
        onDismiss={() => setToast(null)}
        variant="success"
      />

      {deleteRecipe.isError ? (
        <Toast
          message={readApiError(deleteRecipe.error)}
          onDismiss={() => deleteRecipe.reset()}
          variant="error"
        />
      ) : null}

      {addGaps.isError ? (
        <Toast
          message={readApiError(addGaps.error)}
          onDismiss={() => addGaps.reset()}
          variant="error"
        />
      ) : null}
    </AppShell>
  );
}
