"use client";

import type { components } from "@moja-kuchnia/api-client";
import { BookOpen } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CookingAssistant } from "@/components/cooking-assistant";
import { ImageLightbox } from "@/components/image-lightbox";
import { RecipeDetailHero } from "@/components/recipe-detail-hero";
import { RecipeDetailMeta } from "@/components/recipe-detail-meta";
import { RecipeEstimatePanel } from "@/components/recipe-estimate-panel";
import { RecipeIngredientsPanel } from "@/components/recipe-ingredients-panel";
import { RecipeStepsEditorial } from "@/components/recipe-steps-editorial";
import { Toast } from "@/components/toast";
import { AddRecipeGapsDialog } from "@/components/add-recipe-gaps-dialog";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { mediaDisplayUrl } from "@/lib/media-upload";
import {
  loadCookIdSet,
  nextServings,
  saveCookIdSet,
  shareOrCopyRecipeUrl,
  toggleIdInSet,
} from "@/lib/recipe-detail-state";

export default function RecipeDetailPage() {
  const params = useParams<{ id: string; recipeId: string }>();
  const kitchenId = params.id;
  const recipeId = params.recipeId;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [servings, setServings] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">(
    "success",
  );
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(
    () => loadCookIdSet(recipeId, "ingredients"),
  );
  const [doneSteps, setDoneSteps] = useState<Set<string>>(() =>
    loadCookIdSet(recipeId, "steps"),
  );
  const [cookRecipeId, setCookRecipeId] = useState(recipeId);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(
    null,
  );

  if (cookRecipeId !== recipeId) {
    setCookRecipeId(recipeId);
    setCheckedIngredients(loadCookIdSet(recipeId, "ingredients"));
    setDoneSteps(loadCookIdSet(recipeId, "steps"));
    setServings(null);
  }

  useEffect(() => {
    saveCookIdSet(recipeId, "ingredients", checkedIngredients);
  }, [checkedIngredients, recipeId]);

  useEffect(() => {
    saveCookIdSet(recipeId, "steps", doneSteps);
  }, [doneSteps, recipeId]);

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
        throw new Error(
          "Nie znaleziono przepisu albo nie masz do niego dostępu.",
        );
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
      setToastVariant("success");
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
  const editHref = `/kitchens/${kitchenId}/recipes/${recipeId}/edit`;

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
    setServings((current) => nextServings(current, base, delta));
  }

  function toggleIngredient(id: string) {
    setCheckedIngredients((current) => toggleIdInSet(current, id));
  }

  function toggleStep(id: string) {
    setDoneSteps((current) => toggleIdInSet(current, id));
  }

  function handleBuyGaps() {
    if (availabilityQuery.isPending) {
      return;
    }
    if (!hasGaps) {
      setToastVariant("success");
      setToast("Brak braków — wszystko masz w zapasie.");
      return;
    }
    setGapsOpen(true);
  }

  async function handleShare() {
    if (!recipe) {
      return;
    }
    try {
      const result = await shareOrCopyRecipeUrl(
        window.location.href,
        recipe.name,
      );
      setToastVariant("success");
      setToast(
        result === "shared"
          ? "Udostępniono przepis."
          : "Skopiowano link do schowka.",
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setToastVariant("error");
      setToast("Nie udało się udostępnić przepisu.");
    }
  }

  return (
    <AppShell kitchenId={kitchenId}>
      <article className="recipe-detail w-full bg-stone-50/50">
        {recipeQuery.isPending ? (
          <p className="py-16 text-center text-sm text-stone-500">
            Ładowanie przepisu…
          </p>
        ) : null}

        {recipeQuery.isError ? (
          <p className="py-16 text-center text-sm text-red-600" role="alert">
            {readApiError(recipeQuery.error)}
          </p>
        ) : null}

        {recipe ? (
          <>
            <RecipeDetailHero
              kitchenId={kitchenId}
              coverUrl={coverUrl}
              recipeName={recipe.name}
              description={recipe.description}
              categories={recipe.categories ?? []}
              visibility={recipe.visibility}
              author={recipe.author}
              createdAt={recipe.createdAt}
              sourceUrl={recipe.sourceUrl}
              sourceAuthor={recipe.sourceAuthor}
              isAuthor={isAuthor}
              editHref={editHref}
              onBack={() => router.push(`/kitchens/${kitchenId}/recipes`)}
              onShare={() => void handleShare()}
              onDelete={() => setDeleteOpen(true)}
              onPreviewCover={(src, alt) => setPreview({ src, alt })}
            />

            <RecipeDetailMeta
              servings={activeServings}
              prepTimeMinutes={recipe.prepTimeMinutes}
              cookTimeMinutes={recipe.cookTimeMinutes}
              difficulty={recipe.difficulty}
              gapsPending={availabilityQuery.isPending}
              isAuthor={isAuthor}
              editHref={editHref}
              onServingsDelta={adjustServings}
              onBuyGaps={handleBuyGaps}
            />

            <div className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 lg:px-8 lg:py-8">
              <RecipeEstimatePanel
                kitchenId={kitchenId}
                recipeId={recipeId}
                servings={activeServings}
              />

              <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-12">
                <div className="lg:col-span-4">
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
                </div>
                <div className="lg:col-span-8">
                  <RecipeStepsEditorial
                    steps={recipe.steps}
                    doneStepIds={doneSteps}
                    onToggleStep={toggleStep}
                    onPreview={(src, alt) => setPreview({ src, alt })}
                  />
                </div>
              </div>
            </div>

            {meQuery.data?.id && recipe.steps.length > 0 ? (
              <CookingAssistant
                userId={meQuery.data.id}
                kitchenId={kitchenId}
                recipeId={recipeId}
                recipeUpdatedAt={recipe.updatedAt}
                recipeName={recipe.name}
                steps={recipe.steps}
                ingredients={recipe.ingredients}
                servings={activeServings}
                onServingsDelta={adjustServings}
                completedStepIds={doneSteps}
                onCompletedStepIdsChange={setDoneSteps}
                checkedIngredientIds={checkedIngredients}
                onCheckedIngredientIdsChange={setCheckedIngredients}
                availabilityByIngredientId={availabilityByIngredientId}
                onPreviewImage={(src, alt) => setPreview({ src, alt })}
              />
            ) : null}
          </>
        ) : null}

        {!recipe && !recipeQuery.isPending && !recipeQuery.isError ? (
          <div className="py-16 text-center">
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
        variant={toastVariant}
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
