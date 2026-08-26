import type { components } from "@moja-kuchnia/api-client";

import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";

export type MediaPurpose =
  components["schemas"]["BeginMediaUploadDto"]["purpose"];
export type MediaUploadTarget = components["schemas"]["MediaUploadTargetDto"];
export type MediaImage = components["schemas"]["MediaImageDto"];
export type MediaAsset = components["schemas"]["MediaAssetDto"];
type MediaMimeType =
  components["schemas"]["BeginMediaUploadDto"]["declaredMimeType"];

const ALLOWED_MIME_TYPES: MediaMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

/** Limit klienta zgodny z domyślnym `MEDIA_MAX_UPLOAD_BYTES` w API. */
export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024;

export const MEDIA_FILE_ACCEPT = ALLOWED_MIME_TYPES.join(",");

export const MEDIA_FILE_HINT = "JPEG, PNG albo WebP, maksymalnie 10 MB.";

type FileValidation =
  | { ok: true; mimeType: MediaMimeType }
  | { ok: false; message: string };

export function validateMediaFile(file: File): FileValidation {
  const mimeType = ALLOWED_MIME_TYPES.find((allowed) => allowed === file.type);
  if (!mimeType) {
    return {
      ok: false,
      message: "Wybierz zdjęcie w formacie JPEG, PNG albo WebP.",
    };
  }
  if (file.size === 0) {
    return { ok: false, message: "Wybrany plik jest pusty." };
  }
  if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
    return {
      ok: false,
      message: "Zdjęcie może mieć maksymalnie 10 MB. Wybierz mniejszy plik.",
    };
  }
  return { ok: true, mimeType };
}

/**
 * Podpisane URL-e są krótko żyjące, a sterownik `memory` zwraca schemat
 * `memory://`, którego przeglądarka nie wyrenderuje.
 */
export function mediaDisplayUrl(
  image: MediaImage | null | undefined,
  variant: "full" | "thumbnail" = "full",
): string | null {
  if (!image) {
    return null;
  }
  const candidate =
    variant === "thumbnail" ? (image.thumbnailUrl ?? image.url) : image.url;
  return isDisplayableUrl(candidate) ? candidate : null;
}

export function isDisplayableUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:image/") ||
    url.startsWith("/")
  );
}

export type UploadKitchenMediaOptions = {
  kitchenId: string;
  file: File;
  purpose: MediaPurpose;
  target?: MediaUploadTarget;
  /** Postęp 0–100; wysyłka pliku zajmuje przedział 10–90. */
  onProgress?: (percent: number) => void;
};

/**
 * Pełny przebieg wysyłki: rozpoczęcie, transfer zawartości i zakończenie.
 * Zwraca gotowy zasób (`status: "ready"`) albo rzuca błąd z komunikatem po polsku.
 */
export async function uploadKitchenMedia({
  kitchenId,
  file,
  purpose,
  target,
  onProgress,
}: UploadKitchenMediaOptions): Promise<MediaAsset> {
  const validation = validateMediaFile(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const client = createWebApiClient();
  onProgress?.(5);

  const { data: begun, error: beginError } = await client.POST(
    "/api/kitchens/{kitchenId}/media/uploads",
    {
      params: { path: { kitchenId } },
      body: {
        purpose,
        declaredMimeType: validation.mimeType,
        declaredByteSize: file.size,
        ...(target ? { target } : {}),
      },
    },
  );
  if (beginError || !begun) {
    throw new Error(
      readApiError(beginError, "Nie udało się rozpocząć wysyłki zdjęcia."),
    );
  }

  const { mediaAssetId, uploadUrl, headers } = begun;
  onProgress?.(10);

  if (isMemoryUploadUrl(uploadUrl)) {
    const contentBase64 = await fileToBase64(file);
    onProgress?.(60);
    const { error: memoryError } = await client.POST(
      "/api/kitchens/{kitchenId}/media/{mediaAssetId}/memory-upload",
      {
        params: { path: { kitchenId, mediaAssetId } },
        body: { contentBase64 },
      },
    );
    if (memoryError) {
      throw new Error(
        readApiError(memoryError, "Nie udało się wysłać zdjęcia."),
      );
    }
  } else {
    await putFileWithProgress(uploadUrl, file, headers, (ratio) => {
      onProgress?.(10 + Math.round(ratio * 80));
    });
  }
  onProgress?.(90);

  const { data: asset, error: completeError } = await client.POST(
    "/api/kitchens/{kitchenId}/media/{mediaAssetId}/complete",
    { params: { path: { kitchenId, mediaAssetId } } },
  );
  if (completeError || !asset) {
    throw new Error(
      readApiError(completeError, "Nie udało się przetworzyć zdjęcia."),
    );
  }
  if (asset.status !== "ready") {
    throw new Error("Zdjęcie nie zostało przetworzone. Spróbuj ponownie.");
  }

  onProgress?.(100);
  return asset;
}

/** Usuwa zasób razem z plikami — używane dla wysyłek bez przypisania. */
export async function deleteKitchenMedia(
  kitchenId: string,
  mediaAssetId: string,
): Promise<void> {
  const client = createWebApiClient();
  const { error } = await client.DELETE(
    "/api/kitchens/{kitchenId}/media/{mediaAssetId}",
    { params: { path: { kitchenId, mediaAssetId } } },
  );
  if (error) {
    throw new Error(readApiError(error, "Nie udało się usunąć zdjęcia."));
  }
}

function isMemoryUploadUrl(uploadUrl: string): boolean {
  return uploadUrl.startsWith("/api/") && uploadUrl.endsWith("/memory-upload");
}

function putFileWithProgress(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>,
  onRatio: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl, true);
    for (const [key, value] of Object.entries(headers)) {
      request.setRequestHeader(key, value);
    }
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onRatio(event.loaded / event.total);
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      reject(new Error("Magazyn zdjęć odrzucił wysyłkę. Spróbuj ponownie."));
    });
    request.addEventListener("error", () => {
      reject(new Error("Połączenie z magazynem zdjęć zostało przerwane."));
    });
    request.addEventListener("abort", () => {
      reject(new Error("Wysyłka zdjęcia została przerwana."));
    });
    request.send(file);
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Nie udało się odczytać pliku."));
        return;
      }
      const separator = result.indexOf(",");
      resolve(separator >= 0 ? result.slice(separator + 1) : result);
    });
    reader.addEventListener("error", () => {
      reject(new Error("Nie udało się odczytać pliku."));
    });
    reader.readAsDataURL(file);
  });
}
