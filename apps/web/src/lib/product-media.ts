/** Suggested product categories for the web catalog / stock filters. */
export const PRODUCT_CATEGORY_OPTIONS = [
  "Nabiał",
  "Pieczywo",
  "Mięso i wędliny",
  "Warzywa i owoce",
  "Napoje",
  "Suche i sypkie",
  "Mrożonki",
  "Przyprawy",
  "Inne",
] as const;

/** EAN-8 / UPC-A / EAN-13 / GTIN-14 */
export const EAN_PATTERN = /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/;

export function normalizeOptionalEan(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateOptionalEan(raw: string): string | null {
  const ean = normalizeOptionalEan(raw);
  if (!ean) {
    return null;
  }
  if (!EAN_PATTERN.test(ean)) {
    return "EAN musi mieć 8, 12, 13 albo 14 cyfr (np. 5901234123457).";
  }
  return null;
}

const MAX_IMAGE_SIDE = 512;
const JPEG_QUALITY = 0.72;
const MAX_DATA_URL_LENGTH = 300_000;

/**
 * Reads an image file and returns a compressed JPEG data URL suitable for API storage.
 */
export async function fileToCompressedImageUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Wybierz plik obrazu (JPEG, PNG, WebP lub GIF).");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Nie udało się przetworzyć zdjęcia.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error("Zdjęcie jest zbyt duże nawet po kompresji. Wybierz inne.");
  }
  return dataUrl;
}
