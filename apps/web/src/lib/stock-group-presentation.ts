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

export type GroupThumbSlot =
  | { type: "image"; src: string }
  | { type: "empty" };

export type GroupThumbCollageModel = {
  layout: "empty" | "single" | "grid";
  slots: GroupThumbSlot[];
  /** Badge `+N` when more than 4 variant images. */
  overflowLabel: string | null;
};

/**
 * Stabilna kolumna miniatury 48×48: jedno zdjęcie albo siatka 2×2 (max 4 + badge).
 * Bez ujemnych marginesów / nachodzącego stacku.
 */
export function buildGroupThumbCollage(
  imageUrls: Array<string | null | undefined>,
): GroupThumbCollageModel {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const url of imageUrls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
  }

  if (unique.length === 0) {
    return { layout: "empty", slots: [], overflowLabel: null };
  }

  if (unique.length === 1) {
    return {
      layout: "single",
      slots: [{ type: "image", src: unique[0]! }],
      overflowLabel: null,
    };
  }

  const shown = unique.slice(0, 4);
  const slots: GroupThumbSlot[] = shown.map((src) => ({
    type: "image" as const,
    src,
  }));
  while (slots.length < 4) {
    slots.push({ type: "empty" });
  }

  const overflow = unique.length - 4;
  return {
    layout: "grid",
    slots,
    overflowLabel: overflow > 0 ? `+${overflow}` : null,
  };
}
