"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ImageLightbox } from "@/components/image-lightbox";
import { PreparationCookView } from "@/components/preparation-cook-view";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";

type Availability =
  components["schemas"]["RecipeIngredientAvailabilityDto"];

export default function RecipePreparationCookPage() {
  const params = useParams<{ id: string; recipeId: string }>();
  const kitchenId = params.id;
  const recipeId = params.recipeId;
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

  const servings = recipeQuery.data?.servings ?? 1;
  const availabilityQuery = useQuery({
    queryKey: ["recipe-availability", kitchenId, recipeId, servings],
    enabled: Boolean(recipeQuery.data),
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}/availability",
        {
          params: {
            path: { kitchenId, recipeId },
            query: { servings },
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

  const availabilityByIngredientId = useMemo(() => {
    const map = new Map<string, Availability>();
    for (const item of availabilityQuery.data?.ingredients ?? []) {
      map.set(item.ingredientId, item);
    }
    return map;
  }, [availabilityQuery.data]);

  return (
    <AppShell kitchenId={kitchenId} immersive>
      {recipeQuery.isPending || meQuery.isPending ? (
        <p className="py-16 text-center text-sm text-stone-500">
          Ładowanie trybu przygotowania…
        </p>
      ) : null}
      {recipeQuery.isError ? (
        <p className="py-16 text-center text-sm text-red-600" role="alert">
          {readApiError(recipeQuery.error)}
        </p>
      ) : null}
      {meQuery.data?.id && recipeQuery.data ? (
        <PreparationCookView
          userId={meQuery.data.id}
          kitchenId={kitchenId}
          recipe={recipeQuery.data}
          availabilityByIngredientId={availabilityByIngredientId}
          onPreviewImage={(src, alt) => setPreview({ src, alt })}
        />
      ) : null}
      {preview ? (
        <ImageLightbox
          src={preview.src}
          alt={preview.alt}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </AppShell>
  );
}
