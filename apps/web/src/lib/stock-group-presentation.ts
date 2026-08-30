export function pluralizeBatches(count: number): string {
  if (count === 1) return "1 partia";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return `${count} partie`;
  }
  return `${count} partii`;
}

export function pluralizeVariants(count: number): string {
  if (count === 1) return "1 wariant";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return `${count} warianty`;
  }
  return `${count} wariantów`;
}

export function formatGroupStockSubtitle(args: {
  variantCount: number;
  batchCount: number;
  totalLabel: string;
}): string {
  return `${pluralizeVariants(args.variantCount)} · ${pluralizeBatches(args.batchCount)} · łącznie ${args.totalLabel}`;
}

/**
 * Nagłówek rodzaju nie używa zdjęć wariantów (bez kolażu / bez „pierwszego” zdjęcia).
 * Zachowane dla testów i dokumentacji kontraktu UI.
 */
export function groupHeaderShowsProductPhotos(): false {
  return false;
}
