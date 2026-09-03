"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MediaImageField } from "@/components/media-image-field";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import type { MediaImage } from "@/lib/media-upload";

type RecipeCoverFieldProps = {
  kitchenId: string;
  recipeId: string;
  initialImage: MediaImage | null;
};

/** Okładka istniejącego przepisu — wysyłka i odpięcie działają od razu. */
export function RecipeCoverField({
  kitchenId,
  recipeId,
  initialImage,
}: RecipeCoverFieldProps) {
  const queryClient = useQueryClient();
  const [image, setImage] = useState<MediaImage | null>(initialImage);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["recipe", kitchenId, recipeId],
    });
    await queryClient.invalidateQueries({ queryKey: ["recipes", kitchenId] });
  };

  const attach = useMutation({
    mutationFn: async (mediaAssetId: string) => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}/cover",
        {
          params: { path: { kitchenId, recipeId } },
          body: { mediaAssetId },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się ustawić okładki przepisu."),
        );
      }
      return data;
    },
    onSuccess: async (data) => {
      setImage(data?.image ?? null);
      await invalidate();
    },
  });

  const detach = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { error } = await client.DELETE(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}/cover",
        { params: { path: { kitchenId, recipeId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się usunąć okładki."));
      }
    },
    onSuccess: async () => {
      setImage(null);
      await invalidate();
    },
  });

  return (
    <MediaImageField
      kitchenId={kitchenId}
      purpose="recipe_cover"
      target={{ recipeId }}
      currentImage={image}
      label="Okładka przepisu"
      size="cover"
      pickLabel={image ? "Zmień okładkę" : "Dodaj okładkę"}
      hint="Przeciągnij zdjęcie lub kliknij. JPEG, PNG albo WebP, maks. 10 MB."
      onUploaded={async (mediaAssetId) => {
        await attach.mutateAsync(mediaAssetId);
      }}
      onRemoved={() => detach.mutateAsync()}
    />
  );
}

type RecipeStepImageFieldProps = {
  kitchenId: string;
  recipeId: string;
  stepId: string;
  initialImage: MediaImage | null;
  label?: string;
};

export function RecipeStepImageField({
  kitchenId,
  recipeId,
  stepId,
  initialImage,
  label = "Zdjęcie kroku",
}: RecipeStepImageFieldProps) {
  const queryClient = useQueryClient();
  const [image, setImage] = useState<MediaImage | null>(initialImage);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["recipe", kitchenId, recipeId],
    });

  const attach = useMutation({
    mutationFn: async (mediaAssetId: string) => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}/steps/{stepId}/image",
        {
          params: { path: { kitchenId, recipeId, stepId } },
          body: { mediaAssetId },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się dodać zdjęcia do kroku."),
        );
      }
      return data;
    },
    onSuccess: async (data) => {
      setImage(data?.image ?? null);
      await invalidate();
    },
  });

  const detach = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { error } = await client.DELETE(
        "/api/kitchens/{kitchenId}/recipes/{recipeId}/steps/{stepId}/image",
        { params: { path: { kitchenId, recipeId, stepId } } },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się usunąć zdjęcia kroku."),
        );
      }
    },
    onSuccess: async () => {
      setImage(null);
      await invalidate();
    },
  });

  return (
    <MediaImageField
      kitchenId={kitchenId}
      purpose="recipe_step"
      target={{ recipeStepId: stepId }}
      currentImage={image}
      label={label}
      size="sm"
      onUploaded={async (mediaAssetId) => {
        await attach.mutateAsync(mediaAssetId);
      }}
      onRemoved={() => detach.mutateAsync()}
    />
  );
}
