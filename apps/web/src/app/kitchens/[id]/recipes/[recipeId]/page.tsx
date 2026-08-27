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
import { ImageLightbox } from "@/components/image-lightbox";
import { RecipeEstimatePanel } from "@/components/recipe-estimate-panel";
import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { formatQuantityWithUnit } from "@/lib/format-quantity";
import { mediaDisplayUrl } from "@/lib/media-upload";
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
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(
    null,
  );

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
  const coverUrl = recipe ? mediaDisplayUrl(recipe.coverImage) : null;

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
      return `${ingredient.name} (${productName})`;
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
      return `Masz ${have} / potrzeba ${need}, brakuje ${gap}`;
    }
    return null;
  }

  return (
    <AppShell kitchenId={kitchenId}>
      <article className="w-full">
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
            {coverUrl ? (
              <button
                type="button"
                className="mb-6 block w-full overflow-hidden rounded-2xl border border-gray-200/80 bg-gray-50"
                onClick={() =>
                  setPreview({ src: coverUrl, alt: recipe.name })
                }
                aria-label="Powiększ okładkę przepisu"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć */}
                <img
                  src={coverUrl}
                  alt={`Okładka przepisu ${recipe.name}`}
                  className="h-48 w-full object-cover sm:h-64"
                />
              </button>
            ) : null}

            <header className="mb-6 border-b border-gray-200/80 pb-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                    {recipe.name}
                  </h1>
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
                        <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                          <Link
                            href={`/kitchens/${kitchenId}/recipes/${recipeId}/edit`}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 md:hidden"
                            onClick={() => setMenuOpen(false)}
                          >
                            <Pencil size={14} />
                            Edytuj
                          </Link>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50"
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

              {recipe.description ? (
                <p className="mt-2 max-w-3xl text-base leading-relaxed text-gray-600">
                  {recipe.description}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  {RECIPE_VISIBILITY_LABELS[recipe.visibility]}
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

              <p className="mt-3 text-sm text-gray-500">
                {recipe.author.name},{" "}
                {new Date(recipe.createdAt).toLocaleDateString("pl-PL")}
              </p>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {hasGaps ? (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => setGapsOpen(true)}
                  >
                    <ShoppingCart size={16} className="mr-1.5" />
                    Dodaj braki do listy
                  </Button>
                ) : null}
                {isAuthor ? (
                  <Link
                    href={`/kitchens/${kitchenId}/recipes/${recipeId}/edit`}
                    className="hidden sm:inline-flex"
                  >
                    <Button variant="outline">
                      <Pencil size={16} className="mr-1.5" />
                      Edytuj
                    </Button>
                  </Link>
                ) : null}
              </div>
            </header>

            <div className="mb-8 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-2.5 sm:justify-start sm:px-4">
                <span className="text-xs text-gray-500 sm:text-sm">Porcje</span>
                <div className="flex items-center gap-1.5">
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
                  <span className="min-w-6 text-center text-sm font-semibold text-gray-900">
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
              </div>
              <MetaChip
                label="Przygotowanie"
                value={formatRecipeTime(recipe.prepTimeMinutes)}
              />
              <MetaChip
                label="Gotowanie"
                value={formatRecipeTime(recipe.cookTimeMinutes)}
              />
              <MetaChip
                label="Łącznie"
                value={formatTotalRecipeTime(
                  recipe.prepTimeMinutes,
                  recipe.cookTimeMinutes,
                )}
              />
              <MetaChip
                label="Trudność"
                value={RECIPE_DIFFICULTY_LABELS[recipe.difficulty]}
                className="col-span-2 sm:col-span-1"
              />
            </div>

            <RecipeEstimatePanel
              kitchenId={kitchenId}
              recipeId={recipeId}
              servings={activeServings}
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-8">
              <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
                <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
                  <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
                    Składniki
                  </h2>
                </div>

                {availabilityQuery.isPending ? (
                  <p className="px-4 py-4 text-sm text-gray-500 sm:px-5">
                    Sprawdzanie zapasów…
                  </p>
                ) : null}
                {availabilityQuery.isError ? (
                  <p className="px-4 py-4 text-sm text-red-600 sm:px-5" role="alert">
                    {readApiError(availabilityQuery.error)}
                  </p>
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
                        const displayUnit =
                          availability?.unit ?? ingredient.unit;
                        const hint = availability
                          ? availabilityHint(availability)
                          : null;
                        const checked = checkedIngredients.has(ingredient.id);

                        return (
                          <li
                            key={ingredient.id}
                            className={cn(
                              "flex gap-3 px-4 py-3 sm:px-5",
                              checked && "bg-gray-50/80",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                              checked={checked}
                              onChange={() => toggleIngredient(ingredient.id)}
                              aria-label={`Oznacz ${ingredient.name} jako przygotowane`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={cn(
                                      "text-sm font-medium text-gray-900 sm:text-[15px]",
                                      checked && "text-gray-500 line-through",
                                    )}
                                  >
                                    {ingredientDisplayName(
                                      ingredient,
                                      availability,
                                    )}{" "}
                                    <span
                                      className={cn(
                                        "font-normal text-gray-600",
                                        checked && "text-gray-400",
                                      )}
                                    >
                                      {formatRecipeIngredientQuantity(
                                        displayQuantity,
                                        displayUnit,
                                      )}
                                    </span>
                                  </p>
                                  {ingredient.note ? (
                                    <p className="mt-0.5 text-xs text-gray-500">
                                      {ingredient.note}
                                    </p>
                                  ) : null}
                                  {hint ? (
                                    <p className="mt-1 text-xs leading-snug text-gray-500">
                                      {hint}
                                    </p>
                                  ) : null}
                                </div>
                                {availability ? (
                                  <span
                                    className={cn(
                                      "shrink-0 whitespace-nowrap",
                                      availabilityBadgeClass(
                                        availability.status,
                                      ),
                                    )}
                                  >
                                    {
                                      AVAILABILITY_STATUS_LABELS[
                                        availability.status
                                      ]
                                    }
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                ) : null}
              </section>

              <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
                <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
                  <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
                    Przygotowanie
                  </h2>
                </div>
                <ol className="relative px-4 py-2 sm:px-5">
                  {recipe.steps
                    .slice()
                    .sort((left, right) => left.sortOrder - right.sortOrder)
                    .map((step, index, all) => {
                      const done = doneSteps.has(step.id);
                      const isLast = index === all.length - 1;
                      const stepImageUrl = mediaDisplayUrl(step.image);
                      return (
                        <li
                          key={step.id}
                          className={cn(
                            "relative flex gap-3 py-4",
                            !isLast && "border-b border-gray-100",
                          )}
                        >
                          {!isLast ? (
                            <span
                              className="absolute top-12 bottom-0 left-[15px] w-px bg-emerald-100"
                              aria-hidden
                            />
                          ) : null}
                          <div className="relative z-[1] flex shrink-0 flex-col items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700 ring-4 ring-white">
                              {index + 1}
                            </span>
                            <input
                              type="checkbox"
                              checked={done}
                              onChange={() => toggleStep(step.id)}
                              aria-label={`Krok ${index + 1} wykonany`}
                              className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            />
                          </div>
                          {stepImageUrl ? (
                            <button
                              type="button"
                              className="mt-0.5 h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50 transition-shadow hover:shadow-md sm:h-24 sm:w-24"
                              onClick={() =>
                                setPreview({
                                  src: stepImageUrl,
                                  alt: `Krok ${index + 1}`,
                                })
                              }
                              aria-label={`Powiększ zdjęcie kroku ${index + 1}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć */}
                              <img
                                src={stepImageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : null}
                          <div className="min-w-0 flex-1 pt-0.5">
                            {step.title ? (
                              <p
                                className={cn(
                                  "font-semibold text-gray-900",
                                  done && "text-gray-500 line-through",
                                )}
                              >
                                {step.title}
                              </p>
                            ) : null}
                            <p
                              className={cn(
                                "leading-relaxed text-gray-700",
                                step.title ? "mt-1" : "",
                                done && "text-gray-500 line-through",
                              )}
                            >
                              {step.instruction}
                            </p>
                            {step.durationMinutes ? (
                              <p className="mt-2 text-xs font-medium text-emerald-700">
                                {formatRecipeTime(step.durationMinutes)}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
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

      {preview ? (
        <ImageLightbox
          src={preview.src}
          alt={preview.alt}
          caption={preview.alt}
          onClose={() => setPreview(null)}
        />
      ) : null}

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
          kitchenId={kitchenId}
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
          onProductConfigured={() => {
            void queryClient.invalidateQueries({
              queryKey: ["products", kitchenId],
            });
            void availabilityQuery.refetch();
          }}
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

function MetaChip({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center rounded-xl border border-gray-200/80 bg-white px-3 py-2.5 sm:min-w-[7.5rem] sm:px-4",
        className,
      )}
    >
      <span className="text-[11px] tracking-wide text-gray-500 uppercase sm:text-xs sm:normal-case sm:tracking-normal">
        {label}
      </span>
      <span className="mt-0.5 text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}
