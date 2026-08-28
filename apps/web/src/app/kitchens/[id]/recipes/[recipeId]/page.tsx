"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  BookOpen,
  MoreVertical,
  Pencil,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AddRecipeGapsDialog } from "@/components/add-recipe-gaps-dialog";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageLightbox } from "@/components/image-lightbox";
import { RecipeDetailHero } from "@/components/recipe-detail-hero";
import { RecipeDetailMeta } from "@/components/recipe-detail-meta";
import { RecipeEstimatePanel } from "@/components/recipe-estimate-panel";
import { RecipeIngredientsPanel } from "@/components/recipe-ingredients-panel";
import { RecipeStepsEditorial } from "@/components/recipe-steps-editorial";
import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { mediaDisplayUrl } from "@/lib/media-upload";
import { RECIPE_VISIBILITY_LABELS } from "@/lib/recipe-labels";

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

  return (
    <AppShell kitchenId={kitchenId}>
      <article className="recipe-detail w-full">
        {recipeQuery.isPending ? (
          <p className="text-center text-sm text-stone-500">
            Ładowanie przepisu…
          </p>
        ) : null}

        {recipeQuery.isError ? (
          <p className="text-center text-sm text-red-600" role="alert">
            {readApiError(recipeQuery.error)}
          </p>
        ) : null}

        {recipe ? (
          <>
            <RecipeDetailHero
              coverUrl={coverUrl}
              recipeName={recipe.name}
              onPreview={(src, alt) => setPreview({ src, alt })}
            />

            <header className="mb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="font-serif text-3xl leading-tight tracking-tight text-stone-900 sm:text-4xl lg:text-[2.75rem]">
                    {recipe.name}
                  </h1>
                </div>
                <div className="recipe-print-hide relative shrink-0" ref={menuRef}>
                  {isAuthor ? (
                    <>
                      <button
                        type="button"
                        aria-label="Więcej akcji"
                        aria-expanded={menuOpen}
                        className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
                        onClick={() => setMenuOpen((open) => !open)}
                      >
                        <MoreVertical size={20} />
                      </button>
                      {menuOpen ? (
                        <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-stone-100 bg-white py-1 shadow-lg">
                          <Link
                            href={`/kitchens/${kitchenId}/recipes/${recipeId}/edit`}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-stone-700 hover:bg-stone-50 md:hidden"
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
                <p className="mt-4 max-w-3xl text-base leading-relaxed text-stone-600 sm:text-lg sm:leading-8">
                  {recipe.description}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  {RECIPE_VISIBILITY_LABELS[recipe.visibility]}
                </span>
                {recipe.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <p className="mt-3 text-sm text-stone-500">
                {recipe.author.name},{" "}
                {new Date(recipe.createdAt).toLocaleDateString("pl-PL")}
              </p>

              <div className="recipe-print-hide mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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

            <RecipeDetailMeta
              servings={activeServings}
              prepTimeMinutes={recipe.prepTimeMinutes}
              cookTimeMinutes={recipe.cookTimeMinutes}
              difficulty={recipe.difficulty}
              onServingsDelta={adjustServings}
            />

            <RecipeEstimatePanel
              kitchenId={kitchenId}
              recipeId={recipeId}
              servings={activeServings}
            />

            <div className="grid gap-10 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-start lg:gap-12 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
              <RecipeIngredientsPanel
                ingredients={recipe.ingredients}
                ingredientGroups={recipe.ingredientGroups}
                availabilityByIngredientId={availabilityByIngredientId}
                checkedIngredientIds={checkedIngredients}
                availabilityPending={availabilityQuery.isPending}
                availabilityError={
                  availabilityQuery.isError
                    ? readApiError(availabilityQuery.error)
                    : null
                }
                onToggleIngredient={toggleIngredient}
              />
              <RecipeStepsEditorial
                steps={recipe.steps}
                doneStepIds={doneSteps}
                onToggleStep={toggleStep}
                onPreview={(src, alt) => setPreview({ src, alt })}
              />
            </div>
          </>
        ) : null}

        {!recipe && !recipeQuery.isPending && !recipeQuery.isError ? (
          <div className="text-center">
            <BookOpen size={32} className="mx-auto mb-3 text-stone-300" />
            <p className="text-sm text-stone-500">Nie znaleziono przepisu.</p>
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
