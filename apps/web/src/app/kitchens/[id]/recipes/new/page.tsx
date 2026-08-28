"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import {
  RecipeForm,
  type RecipeFormMedia,
  type RecipeFormValues,
} from "@/components/recipe-form";
import { Button } from "@/components/ui/button";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { uploadKitchenMedia } from "@/lib/media-upload";

export default function NewRecipePage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const router = useRouter();

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

  const createRecipe = useMutation({
    mutationFn: async ({
      body,
      media,
    }: {
      body: RecipeFormValues;
      media: RecipeFormMedia;
    }) => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/recipes",
        {
          params: { path: { kitchenId } },
          body,
        },
      );
      if (error || !data) {
        throw new Error(readApiError(error, "Nie udało się utworzyć przepisu."));
      }

      if (media.coverFile) {
        const asset = await uploadKitchenMedia({
          kitchenId,
          file: media.coverFile,
          purpose: "recipe_cover",
          target: { recipeId: data.id },
        });
        const { error: attachError } = await client.POST(
          "/api/kitchens/{kitchenId}/recipes/{recipeId}/cover",
          {
            params: { path: { kitchenId, recipeId: data.id } },
            body: { mediaAssetId: asset.id },
          },
        );
        if (attachError) {
          throw new Error(
            readApiError(
              attachError,
              "Przepis powstał, ale nie udało się ustawić okładki.",
            ),
          );
        }
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
              `Przepis powstał, ale nie udało się dodać zdjęcia kroku ${index + 1}.`,
            ),
          );
        }
      }

      return data;
    },
    onSuccess: (recipe) => {
      router.push(`/kitchens/${kitchenId}/recipes/${recipe.id}`);
    },
  });

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Nowy przepis
            </h1>
          </div>
          <Link href={`/kitchens/${kitchenId}/recipes`}>
            <Button variant="outline">Anuluj</Button>
          </Link>
        </header>

        {productsQuery.isPending ? (
          <div className="rounded-3xl border border-gray-100 bg-white p-12 text-center text-sm text-gray-500 shadow-sm">
            Ładowanie katalogu produktów…
          </div>
        ) : null}

        {productsQuery.isError ? (
          <div
            className="rounded-3xl border border-red-100 bg-white p-12 text-center text-sm text-red-600 shadow-sm"
            role="alert"
          >
            {readApiError(productsQuery.error)}
          </div>
        ) : null}

        {productsQuery.isSuccess ? (
          <>
            <RecipeForm
              kitchenId={kitchenId}
              products={productsQuery.data}
              submitLabel="Utwórz przepis"
              pending={createRecipe.isPending}
              onSubmit={(body, media) =>
                createRecipe.mutate({ body, media })
              }
            />
            {createRecipe.isError ? (
              <p className="text-sm text-red-600" role="alert">
                {readApiError(createRecipe.error)}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
