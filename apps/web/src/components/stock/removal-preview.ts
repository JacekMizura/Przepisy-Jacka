import type { components } from "@moja-kuchnia/api-client";

import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";

export type ProductRemovalPreview =
  components["schemas"]["ProductRemovalPreviewDto"];

export async function fetchProductRemovalPreview(
  kitchenId: string,
  productId: string,
): Promise<ProductRemovalPreview | null> {
  try {
    const client = createWebApiClient();
    const { data, error, response } = await client.GET(
      "/api/kitchens/{kitchenId}/products/{productId}/removal-preview",
      { params: { path: { kitchenId, productId } } },
    );
    if (response.status === 404) {
      return null;
    }
    if (error || !data) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function removalDialogCopy(preview: ProductRemovalPreview | null): {
  titleSuffix: string;
  description: string;
} {
  if (!preview) {
    return {
      titleSuffix: "",
      description:
        "Sprawdzimy, czy produkt można bezpiecznie cofnąć. Jeśli był używany, zaproponujemy archiwizację.",
    };
  }
  if (preview.mode === "undo" && preview.canUndo) {
    const remove =
      preview.willRemove.length > 0
        ? `Usuniemy: ${preview.willRemove.join(", ")}.`
        : "Usuniemy produkt i powiązane dane przyjęcia.";
    return {
      titleSuffix: "",
      description: `${remove} Operacji nie da się cofnąć.`,
    };
  }
  if (preview.mode === "archive") {
    const keep =
      preview.willKeep.length > 0
        ? ` Pozostanie: ${preview.willKeep.join(", ")}.`
        : "";
    return {
      titleSuffix: "",
      description: `${preview.reason ?? "Trwałego cofnięcia nie można wykonać."}${keep} Możesz zarchiwizować produkt.`,
    };
  }
  return {
    titleSuffix: "",
    description:
      preview.reason ??
      "Tej operacji nie da się teraz wykonać. Sprawdź listę zakupów lub historię.",
  };
}

export async function undoProductAddition(
  kitchenId: string,
  productId: string,
): Promise<void> {
  const client = createWebApiClient();
  const { error, response } = await client.POST(
    "/api/kitchens/{kitchenId}/products/{productId}/undo-addition",
    { params: { path: { kitchenId, productId } } },
  );
  if (response.status === 409) {
    throw new Error(
      readApiError(
        error,
        "Nie można cofnąć dodania — produkt był już używany. Zarchiwizuj go zamiast tego.",
      ),
    );
  }
  if (error) {
    throw new Error(
      readApiError(error, "Nie udało się cofnąć dodania produktu."),
    );
  }
}
