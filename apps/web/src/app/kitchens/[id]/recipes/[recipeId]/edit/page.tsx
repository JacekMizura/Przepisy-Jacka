"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { RecipeForm, type RecipeFormValues } from "@/components/recipe-form";
import { Button } from "@/components/ui/button";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";

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
    mutationFn: async (body: RecipeFormValues) => {
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
      if (error) {
        throw new Error(readApiError(error, "Nie udało się zapisać przepisu."));
      }
      return data;
    },
    onSuccess: (recipe) => {
      queryClient.invalidateQueries({ queryKey: ["recipes", kitchenId] });
      queryClient.invalidateQueries({
        queryKey: ["recipe", kitchenId, recipeId],
      });
      if (recipe) {
        router.push(`/kitchens/${kitchenId}/recipes/${recipe.id}`);
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
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Edycja przepisu
            </h1>
            <p className="mt-2 text-gray-500">
              Zmiany są widoczne dla osób, które mają dostęp do tego przepisu.
              Okładka i zdjęcia kroków zapisują się od razu po wysłaniu.
            </p>
          </div>
          <Link href={`/kitchens/${kitchenId}/recipes/${recipeId}`}>
            <Button variant="outline">Anuluj</Button>
          </Link>
        </header>

        {isLoading ? (
          <div className="rounded-3xl border border-gray-100 bg-white p-12 text-center text-sm text-gray-500 shadow-sm">
            Ładowanie przepisu…
          </div>
        ) : null}

        {isError ? (
          <div
            className="rounded-3xl border border-red-100 bg-red-50 p-6 text-sm text-red-700"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        {!isLoading && !isError && recipe && !isAuthor ? (
          <div className="flex items-start gap-3 rounded-3xl border border-amber-100 bg-amber-50 p-6 text-sm text-amber-900">
            <ShieldAlert size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Brak uprawnień do edycji</p>
              <p className="mt-1">
                Ten przepis może edytować wyłącznie jego autor (
                {recipe.author.name}).
              </p>
            </div>
          </div>
        ) : null}

        {!isLoading && !isError && recipe && isAuthor ? (
          <>
            <RecipeForm
              kitchenId={kitchenId}
              products={productsQuery.data ?? []}
              initialRecipe={recipe}
              submitLabel="Zapisz zmiany"
              pending={updateRecipe.isPending}
              onSubmit={(body) => updateRecipe.mutate(body)}
            />
            {updateRecipe.isError ? (
              <p className="text-sm text-red-600" role="alert">
                {readApiError(updateRecipe.error)}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
