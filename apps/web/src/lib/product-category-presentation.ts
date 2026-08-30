import type { LucideIcon } from "lucide-react";
import {
  Beef,
  Carrot,
  CircleDashed,
  Coffee,
  Cookie,
  Flame,
  Milk,
  Package,
  Snowflake,
  Wheat,
} from "lucide-react";

/** Etykiety Product.category obsługiwane w aplikacji (źródło prawdy dla UI). */
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

export type ProductCategoryPresentation = {
  /** Wartość zapisywana w Product.category (puste = Bez kategorii / null w API). */
  value: string;
  label: string;
  icon: LucideIcon;
  /** Klasy Tailwind dla stanu wybranego (tło, tekst, ramka). */
  selectedClassName: string;
  /** Kolor tekstu/ikony do badge poza selektorem. */
  accentTextClassName: string;
};

const NEUTRAL: Omit<ProductCategoryPresentation, "value" | "label"> = {
  icon: Package,
  selectedClassName: "bg-slate-100 text-slate-700 border-slate-300",
  accentTextClassName: "text-slate-600",
};

const BY_LABEL: Record<
  string,
  Omit<ProductCategoryPresentation, "value" | "label">
> = {
  Nabiał: {
    icon: Milk,
    selectedClassName: "bg-blue-100 text-blue-700 border-blue-300",
    accentTextClassName: "text-blue-700",
  },
  Pieczywo: {
    icon: Wheat,
    selectedClassName: "bg-amber-100 text-amber-800 border-amber-300",
    accentTextClassName: "text-amber-800",
  },
  "Mięso i wędliny": {
    icon: Beef,
    selectedClassName: "bg-rose-100 text-rose-700 border-rose-300",
    accentTextClassName: "text-rose-700",
  },
  "Warzywa i owoce": {
    icon: Carrot,
    selectedClassName: "bg-emerald-100 text-emerald-700 border-emerald-300",
    accentTextClassName: "text-emerald-700",
  },
  Napoje: {
    icon: Coffee,
    selectedClassName: "bg-sky-100 text-sky-700 border-sky-300",
    accentTextClassName: "text-sky-700",
  },
  "Suche i sypkie": {
    icon: Cookie,
    selectedClassName: "bg-yellow-100 text-yellow-800 border-yellow-300",
    accentTextClassName: "text-yellow-800",
  },
  Mrożonki: {
    icon: Snowflake,
    selectedClassName: "bg-cyan-100 text-cyan-700 border-cyan-300",
    accentTextClassName: "text-cyan-700",
  },
  Przyprawy: {
    icon: Flame,
    selectedClassName: "bg-orange-100 text-orange-700 border-orange-300",
    accentTextClassName: "text-orange-700",
  },
  Inne: {
    icon: Package,
    selectedClassName: "bg-amber-100 text-amber-700 border-amber-300",
    accentTextClassName: "text-amber-700",
  },
};

/** Kafelek „Bez kategorii” — value pusty string (API: null). */
export const UNCATED_CATEGORY_VALUE = "";

export const UNCATED_CATEGORY_LABEL = "Bez kategorii";

/**
 * Prezentacja kategorii produktu (ikona + kolor).
 * Nieznane etykiety → Package + neutralny kolor (bez błędu).
 */
export function getProductCategoryPresentation(
  category: string | null | undefined,
): ProductCategoryPresentation {
  const trimmed = category?.trim() ?? "";
  if (!trimmed) {
    return {
      value: UNCATED_CATEGORY_VALUE,
      label: UNCATED_CATEGORY_LABEL,
      icon: CircleDashed,
      selectedClassName: "bg-slate-100 text-slate-600 border-slate-300",
      accentTextClassName: "text-slate-500",
    };
  }
  const mapped = BY_LABEL[trimmed] ?? NEUTRAL;
  return {
    value: trimmed,
    label: trimmed,
    icon: mapped.icon,
    selectedClassName: mapped.selectedClassName,
    accentTextClassName: mapped.accentTextClassName,
  };
}

/** Kafelki w selektorze: Bez kategorii + wszystkie znane opcje (+ opcjonalne dodatkowe z katalogu). */
export function listProductCategoryTiles(
  extraCategories: Iterable<string> = [],
): ProductCategoryPresentation[] {
  const seen = new Set<string>();
  const tiles: ProductCategoryPresentation[] = [];

  const push = (raw: string) => {
    const presentation = getProductCategoryPresentation(raw);
    const key = presentation.value || "__none__";
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    tiles.push(presentation);
  };

  push(UNCATED_CATEGORY_VALUE);
  for (const option of PRODUCT_CATEGORY_OPTIONS) {
    push(option);
  }
  for (const extra of extraCategories) {
    const trimmed = extra.trim();
    if (trimmed) {
      push(trimmed);
    }
  }
  return tiles;
}

/** Stan przycisku kafelka (aria-pressed / type) — bez React. */
export type CategoryTileButtonState = {
  value: string;
  label: string;
  pressed: boolean;
  type: "button";
};

export function buildCategoryTileButtonStates(
  selectedValue: string,
  extraCategories: Iterable<string> = [],
): CategoryTileButtonState[] {
  const selected = selectedValue.trim();
  return listProductCategoryTiles(extraCategories).map((tile) => ({
    value: tile.value,
    label: tile.label,
    pressed: selected === tile.value,
    type: "button",
  }));
}

export { Package as FALLBACK_CATEGORY_ICON };
