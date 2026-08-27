import sharp from 'sharp';

import { MediaPurpose } from '../generated/prisma/client';

export type SniffedImageKind = 'image/jpeg' | 'image/png' | 'image/webp';

export const ALLOWED_UPLOAD_MIME_TYPES: SniffedImageKind[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const PROCESSED_MIME_TYPE = 'image/webp';

/** Maksymalna dłuższa krawędź obrazu głównego zależy od przeznaczenia. */
export const MAX_DIMENSION_BY_PURPOSE: Record<MediaPurpose, number> = {
  [MediaPurpose.product]: 800,
  [MediaPurpose.recipe_cover]: 1600,
  [MediaPurpose.recipe_step]: 1200,
};

export const THUMBNAIL_MAX_DIMENSION = 400;

export type ProcessedImage = {
  data: Buffer;
  width: number;
  height: number;
  byteSize: number;
};

export type ProcessedMediaImage = {
  main: ProcessedImage;
  thumbnail: ProcessedImage;
};

/**
 * Rozpoznaje format po nagłówku pliku. Nagłówek `Content-Type` od klienta
 * nie jest dowodem na zawartość.
 */
export function sniffImageKind(buffer: Buffer): SniffedImageKind | null {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG_MAGIC)) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Normalizuje obraz: obrót zgodnie z EXIF, usunięcie metadanych (EXIF/GPS),
 * konwersja do WebP i skalowanie w dół. sharp domyślnie nie kopiuje metadanych
 * do wyniku, więc dane lokalizacji nie trafiają do magazynu.
 */
export async function processMediaImage(
  input: Buffer,
  purpose: MediaPurpose,
): Promise<ProcessedMediaImage> {
  const maxDimension = MAX_DIMENSION_BY_PURPOSE[purpose];
  const [main, thumbnail] = await Promise.all([
    renderWebp(input, maxDimension),
    renderWebp(input, THUMBNAIL_MAX_DIMENSION),
  ]);
  return { main, thumbnail };
}

async function renderWebp(
  input: Buffer,
  maxDimension: number,
): Promise<ProcessedImage> {
  const { data, info } = await sharp(input, { failOn: 'error' })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    byteSize: data.byteLength,
  };
}
