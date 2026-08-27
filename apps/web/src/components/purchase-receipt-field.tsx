"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MediaImageField } from "@/components/media-image-field";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import type { MediaImage } from "@/lib/media-upload";

type PurchaseReceiptFieldProps = {
  kitchenId: string;
  purchaseId: string;
  initialImage: MediaImage | null;
};

/** Zdjęcie paragonu — wysyłka i odpięcie działają od razu. */
export function PurchaseReceiptField({
  kitchenId,
  purchaseId,
  initialImage,
}: PurchaseReceiptFieldProps) {
  const queryClient = useQueryClient();
  const [image, setImage] = useState<MediaImage | null>(initialImage);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["purchase", kitchenId, purchaseId],
    });
    await queryClient.invalidateQueries({ queryKey: ["purchases", kitchenId] });
  };

  const attach = useMutation({
    mutationFn: async (mediaAssetId: string) => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/purchases/{purchaseId}/receipt",
        {
          params: { path: { kitchenId, purchaseId } },
          body: { mediaAssetId },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się ustawić zdjęcia paragonu."),
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
        "/api/kitchens/{kitchenId}/purchases/{purchaseId}/receipt",
        { params: { path: { kitchenId, purchaseId } } },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się usunąć zdjęcia paragonu."),
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
      purpose="purchase_receipt"
      target={{ purchaseId }}
      currentImage={image}
      label="Zdjęcie paragonu"
      size="wide"
      onUploaded={async (mediaAssetId) => {
        await attach.mutateAsync(mediaAssetId);
      }}
      onRemoved={() => detach.mutateAsync()}
    />
  );
}
