"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ArrowLeft, Save, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  RecipeForm,
  type RecipeFormMedia,
  type RecipeFormValues,
} from "@/components/recipe-form";
import { Toast } from "@/components/toast";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { uploadKitchenMedia } from "@/lib/media-upload";

type UpdateRecipeBody = components["schemas"]["UpdateRecipeDto"];
type RecipeDetail = components["schemas"]["RecipeDetailDto"];
type CreateRecipeBody = components["schemas"]["CreateRecipeDto"];

/**
 * Gdy zmienia się struktura (grupy / składniki / kroki), wysyłamy wszystkie
 * trzy kolekcje razem — w tym puste `ingredientGroups` — żeby grupy zostały
 * zsynchronizowane. Zdjęcie kroku zostaje zachowane, gdy w payloadzie jest `id`.
 */
function toUpdateRecipeBody(
  body: RecipeFormValues,
  recipe: RecipeDetail,
): UpdateRecipeBody {
  const { ingredients, steps, ingredientGroups, ...rest } = body;
  const structureChanged =
    !ingredientsUnchanged(ingredients, recipe) ||
    !stepsUnchanged(steps, recipe) ||
    !groupsUnchanged(ingredientGroups, recipe);

  if (!structureChanged) {
    return { ...rest };
  }

  return {
    ...rest,
    ingredients,
    steps,
    ingredientGroups: ingredientGroups ?? [],
  };
}

function ingredientsUnchanged(
  next: CreateRecipeBody["ingredients"],
  recipe: RecipeDetail,
): boolean {
  const current = recipe.ingredients
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  if (current.length !== next.length) {
    return false;
  }
  return next.every((ingredient, index) => {
    const existing = current[index];
    if (!existing) {
      return false;
    }
    return (
      (ingredient.id ?? null) === existing.id &&
      (ingredient.groupId ?? null) === existing.groupId &&
      ingredient.name === existing.name &&
      (ingredient.quantity ?? null) === existing.quantity &&
      ingredient.unit === existing.unit &&
      (ingredient.note ?? null) === existing.note &&
      (ingredient.productId ?? null) === existing.productId &&
      ingredient.sortOrder === existing.sortOrder
    );
  });
}

function stepsUnchanged(
  next: CreateRecipeBody["steps"],
  recipe: RecipeDetail,
): boolean {
  const current = recipe.steps
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  if (current.length !== next.length) {
    return false;
  }
  return next.every((step, index) => {
    const existing = current[index];
    if (!existing) {
      return false;
    }
    return (
      (step.id ?? null) === existing.id &&
      (step.title ?? null) === existing.title &&
      step.instruction === existing.instruction &&
      (step.tip ?? null) === existing.tip &&
      (step.durationMinutes ?? null) === existing.durationMinutes &&
      step.sortOrder === existing.sortOrder
    );
  });
}

function groupsUnchanged(
  next: CreateRecipeBody["ingredientGroups"] | undefined,
  recipe: RecipeDetail,
): boolean {
  const incoming = [...(next ?? [])].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const current = [...recipe.ingredientGroups].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  if (current.length !== incoming.length) {
    return false;
  }
  return incoming.every((group, index) => {
    const existing = current[index];
    if (!existing) {
      return false;
    }
    return (
      group.id === existing.id &&
      group.name === existing.name &&
      group.sortOrder === existing.sortOrder
    );
  });
}

export default function EditRecipePage() {
  const params = useParams<{ id: string; recipeId: string }>();
  const kitchenId = params.id;
  const recipeId = params.recipeId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const detailHref = `/kitchens/${kitchenId}/recipes/${recipeId}`;

  const requestLeave = useCallback(
    (href: string) => {
      if (!dirty) {
        router.push(href);
        return;
      }
      setLeaveHref(href);
      setLeaveOpen(true);
    },
    [dirty, router],
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

  const productsQuery = useQuery({
    queryKey: ["products", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error, response } = await client.GET(
        "/api/kitchens/{kitchenId}/products",
        { params: { path: { kitchenId } } },
      );
      if (response.status === 404) {
        throw new Error("Nie znaleziono kuchni albo nie masz do niej dostępu.");
      }
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać produktów."));
      }
      return data ?? [];
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

  const updateRecipe = useMutation({
    mutationFn: async ({
      body,
      media,
    }: {
      body: RecipeFormValues;
      media: RecipeFormMedia;
    }) => {
      if (!recipeQuery.data) {
        throw new Error("Brak przepisu do edycji.");
      }
      const client = createWebApiClient();
      const { data, error, response } = await client.PATCH(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}",
        {
          params: { path: { kitchenId, recipeId } },
          body: toUpdateRecipeBody(body, recipeQuery.data),
        },
      );
      if (response.status === 403) {
        throw new Error("Tę operację może wykonać wyłącznie autor przepisu.");
      }
      if (response.status === 404) {
        throw new Error("Nie znaleziono przepisu.");
      }
      if (error || !data) {
        throw new Error(readApiError(error, "Nie udało się zapisać przepisu."));
      }

      const sortedSteps = data.steps
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder);
      for (let index = 0; index < sortedSteps.length; index++) {
        const step = sortedSteps[index];
        const file = media.stepFiles[index];
        if (!step || !file) {
          continue;
        }
        const asset = await uploadKitchenMedia({
          kitchenId,
          file,
          purpose: "recipe_step",
          target: { recipeStepId: step.id },
        });
        const { error: stepAttachError } = await client.POST(
          "/api/kitchens/{kitchenId}/recipes/{recipeId}/steps/{stepId}/image",
          {
            params: {
              path: { kitchenId, recipeId: data.id, stepId: step.id },
            },
            body: { mediaAssetId: asset.id },
          },
        );
        if (stepAttachError) {
          throw new Error(
            readApiError(
              stepAttachError,
              `Zapisano przepis, ale nie udało się dodać zdjęcia kroku ${index + 1}.`,
            ),
          );
        }
      }

      return data;
    },
    onSuccess: (recipe) => {
      setDirty(false);
      setToast("Zapisano zmiany przepisu.");
      queryClient.invalidateQueries({ queryKey: ["recipes", kitchenId] });
      queryClient.invalidateQueries({
        queryKey: ["recipe", kitchenId, recipeId],
      });
      if (recipe) {
        window.setTimeout(() => {
          router.push(`/kitchens/${kitchenId}/recipes/${recipe.id}`);
        }, 400);
      }
    },
  });

  const isLoading =
    meQuery.isPending || productsQuery.isPending || recipeQuery.isPending;
  const isError =
    meQuery.isError || productsQuery.isError || recipeQuery.isError;
  const errorMessage = meQuery.isError
    ? readApiError(meQuery.error)
    : productsQuery.isError
      ? readApiError(productsQuery.error)
      : recipeQuery.isError
        ? readApiError(recipeQuery.error)
        : null;

  const recipe = recipeQuery.data;
  const isAuthor = Boolean(
    recipe && meQuery.data && recipe.author.id === meQuery.data.id,
  );

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="-mx-4 -mt-4 bg-stone-100/80 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-stone-200 bg-white/80 px-4 shadow-sm backdrop-blur-md sm:h-20 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => requestLeave(detailHref)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-stone-500 transition-colors hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
              aria-label="Wróć do przepisu"
            >
              <ArrowLeft size={20} aria-hidden />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-stone-900 sm:text-lg">
                Edycja przepisu
              </h1>
              <p className="hidden text-xs text-stone-500 sm:block">
                Uzupełnij dane przepisu, składniki i przygotowanie.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => requestLeave(detailHref)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 sm:px-4"
            >
              Anuluj
            </button>
            {isAuthor ? (
              <button
                type="submit"
                form="recipe-edit-form"
                disabled={updateRecipe.isPending || isLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] transition-all hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:opacity-60 sm:px-6"
              >
                <Save size={18} aria-hidden />
                <span className="hidden sm:inline">
                  {updateRecipe.isPending ? "Zapisywanie…" : "Zapisz zmiany"}
                </span>
                <span className="sm:hidden">
                  {updateRecipe.isPending ? "…" : "Zapisz"}
                </span>
              </button>
            ) : null}
          </div>
        </header>

        <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {isLoading ? (
            <div className="mx-auto max-w-4xl rounded-2xl border border-stone-200 bg-white p-12 text-center text-sm text-stone-500 shadow-sm">
              Ładowanie przepisu…
            </div>
          ) : null}

          {isError ? (
            <div
              className="mx-auto max-w-4xl rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-700"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : null}

          {!isLoading && !isError && recipe && !isAuthor ? (
            <div className="mx-auto flex max-w-4xl items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-6 text-sm text-amber-900">
              <ShieldAlert size={20} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Brak uprawnień do edycji</p>
                <p className="mt-1">
                  Ten przepis może edytować wyłącznie jego autor (
                  {recipe.author.name}).
                </p>
                <Link
                  href={detailHref}
                  className="mt-3 inline-block text-sm font-medium text-amber-800 underline"
                >
                  Wróć do przepisu
                </Link>
              </div>
            </div>
          ) : null}

          {!isLoading && !isError && recipe && isAuthor ? (
            <>
              <RecipeForm
                formId="recipe-edit-form"
                hideSubmit
                kitchenId={kitchenId}
                products={productsQuery.data ?? []}
                initialRecipe={recipe}
                submitLabel="Zapisz zmiany"
                pending={updateRecipe.isPending}
                onDirtyChange={setDirty}
                onSubmit={(body, media) =>
                  updateRecipe.mutate({ body, media })
                }
              />
              {updateRecipe.isError ? (
                <p className="mx-auto mt-4 max-w-4xl text-sm text-red-600" role="alert">
                  {readApiError(updateRecipe.error)}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {leaveOpen ? (
        <ConfirmDialog
          title="Niezapisane zmiany"
          description="Masz niezapisane zmiany. Czy na pewno chcesz opuścić edycję?"
          confirmLabel="Opuść edycję"
          confirmVariant="amber"
          onConfirm={() => {
            const href = leaveHref ?? detailHref;
            setLeaveOpen(false);
            setDirty(false);
            router.push(href);
          }}
          onCancel={() => {
            setLeaveOpen(false);
            setLeaveHref(null);
          }}
        />
      ) : null}

      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </AppShell>
  );
}
