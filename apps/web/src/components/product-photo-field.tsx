"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MediaImageField } from "@/components/media-image-field";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import type { MediaImage } from "@/lib/media-upload";

type ProductPhotoFieldProps = {
  kitchenId: string;
  productId: string;
  image: MediaImage | null;
  label?: string;
};

/** Zdjęcie istniejącego produktu — wysyłka i odpięcie działają od razu. */
export function ProductPhotoField({
  kitchenId,
  productId,
  image,
  label = "Zdjęcie produktu",
}: ProductPhotoFieldProps) {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });

  const attach = useMutation({
    mutationFn: async (mediaAssetId: string) => {
      const client = createWebApiClient();
      const { error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/image",
        {
          params: { path: { kitchenId, productId } },
          body: { mediaAssetId },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się przypisać zdjęcia do produktu."),
        );
      }
    },
    onSuccess: invalidate,
  });

  const detach = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { error } = await client.DELETE(
        "/api/kitchens/{kitchenId}/products/{productId}/image",
        { params: { path: { kitchenId, productId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się usunąć zdjęcia."));
      }
    },
    onSuccess: invalidate,
  });

  return (
    <MediaImageField
      kitchenId={kitchenId}
      purpose="product"
      target={{ productId }}
      currentImage={image}
      label={label}
      size="sm"
      onUploaded={(mediaAssetId) => attach.mutateAsync(mediaAssetId)}
      onRemoved={() => detach.mutateAsync()}
    />
  );
}
