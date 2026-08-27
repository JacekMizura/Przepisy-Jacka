"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { RecipeForm } from "@/components/recipe-form";
import { Button } from "@/components/ui/button";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";

type CreateRecipeBody = components["schemas"]["CreateRecipeDto"];
type UpdateRecipeBody = components["schemas"]["UpdateRecipeDto"];
type RecipeDetail = components["schemas"]["RecipeDetailDto"];

/**
 * API odtwarza składniki i kroki od zera, a odtworzone kroki tracą zdjęcia.
 * Niezmienione kolekcje pomijamy, żeby zapis opisu nie usuwał zdjęć kroków.
 */
function toUpdateRecipeBody(
  body: CreateRecipeBody,
  recipe: RecipeDetail,
): UpdateRecipeBody {
  const { ingredients, steps, ...rest } = body;
  return {
    ...rest,
    ...(ingredientsUnchanged(ingredients, recipe) ? {} : { ingredients }),
    ...(stepsUnchanged(steps, recipe) ? {} : { steps }),
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
      (step.title ?? null) === existing.title &&
      step.instruction === existing.instruction &&
      (step.durationMinutes ?? null) === existing.durationMinutes &&
      step.sortOrder === existing.sortOrder
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
    mutationFn: async (body: components["schemas"]["UpdateRecipeDto"]) => {
      const client = createWebApiClient();
      const { data, error, response } = await client.PATCH(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}",
        { params: { path: { kitchenId, recipeId } }, body },
      );
      if (response.status === 403 || response.status === 404) {
        throw new Error("Tylko autor może edytować ten przepis.");
      }
      if (error) {
        throw new Error(readApiError(error, "Nie udało się zapisać przepisu."));
      }
      return data;
    },
    onSuccess: (recipe) => {
      queryClient.invalidateQueries({ queryKey: ["recipes", kitchenId] });
      queryClient.invalidateQueries({ queryKey: ["recipe", kitchenId, recipeId] });
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
            className="rounded-3xl border border-red-100 bg-white p-12 text-center text-sm text-red-600 shadow-sm"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        {!isLoading && !isError && recipe && !isAuthor ? (
          <div className="rounded-3xl border border-amber-100 bg-amber-50 px-6 py-10 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-amber-600">
              <ShieldAlert size={28} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Brak uprawnień do edycji
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
              Tylko autor przepisu może go edytować. Możesz wrócić do podglądu
              przepisu.
            </p>
            <Link
              href={`/kitchens/${kitchenId}/recipes/${recipeId}`}
              className="mt-6 inline-block"
            >
              <Button variant="outline">Wróć do przepisu</Button>
            </Link>
          </div>
        ) : null}

        {!isLoading && !isError && recipe && isAuthor && productsQuery.data ? (
          <>
            <RecipeForm
              key={recipe.id}
              kitchenId={kitchenId}
              products={productsQuery.data}
              initialRecipe={recipe}
              submitLabel="Zapisz zmiany"
              pending={updateRecipe.isPending}
              onSubmit={(body) =>
                updateRecipe.mutate(toUpdateRecipeBody(body, recipe))
              }
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
