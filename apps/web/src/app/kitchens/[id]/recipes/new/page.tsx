"use client";

import type { components } from "@moja-kuchnia/api-client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { RecipeForm } from "@/components/recipe-form";
import { Button } from "@/components/ui/button";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";

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
    mutationFn: async (body: components["schemas"]["CreateRecipeDto"]) => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/recipes",
        { params: { path: { kitchenId } }, body },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się utworzyć przepisu."));
      }
      return data;
    },
    onSuccess: (recipe) => {
      if (recipe) {
        router.push(`/kitchens/${kitchenId}/recipes/${recipe.id}`);
      }
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
            <p className="mt-2 text-gray-500">
              Uzupełnij składniki i kroki. Możesz powiązać składniki z produktami
              z katalogu kuchni.
            </p>
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
              products={productsQuery.data}
              submitLabel="Utwórz przepis"
              pending={createRecipe.isPending}
              onSubmit={(body) => createRecipe.mutate(body)}
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
