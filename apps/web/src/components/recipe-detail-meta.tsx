"use client";

import { ChartBar, Flame, Minus, Pencil, Plus, ShoppingCart, Timer, Users } from "lucide-react";
import Link from "next/link";

import {
  formatRecipeTime,
  RECIPE_DIFFICULTY_LABELS,
} from "@/lib/recipe-labels";
import { cn } from "@/lib/utils";

type Difficulty = keyof typeof RECIPE_DIFFICULTY_LABELS;

type RecipeDetailMetaProps = {
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  difficulty: Difficulty;
  hasGaps: boolean;
  gapsPending?: boolean;
  isAuthor: boolean;
  editHref: string;
  onServingsDelta: (delta: number) => void;
  onBuyGaps: () => void;
};

const DIFFICULTY_BARS: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export function RecipeDetailMeta({
  servings,
  prepTimeMinutes,
  cookTimeMinutes,
  difficulty,
  hasGaps,
  gapsPending,
  isAuthor,
  editHref,
  onServingsDelta,
  onBuyGaps,
}: RecipeDetailMetaProps) {
  const filled = DIFFICULTY_BARS[difficulty];

  return (
    <div
      className="recipe-print-hide sticky top-0 z-40 border-b border-stone-200 bg-white shadow-sm"
      data-testid="recipe-detail-meta-bar"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 lg:flex-nowrap lg:px-8">
        <div className="hide-scrollbar flex w-full items-center divide-x divide-stone-200 overflow-x-auto pb-1 lg:w-auto lg:pb-0">
          <div className="flex min-w-[120px] flex-col justify-center px-4 first:pl-0 lg:px-6">
            <span className="mb-1 flex items-center gap-1 text-[10px] font-bold tracking-wider text-stone-400 uppercase">
              <Users size={14} aria-hidden /> Porcje
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:opacity-40"
                onClick={() => onServingsDelta(-1)}
                disabled={servings <= 1}
                aria-label="Zmniejsz liczbę porcji"
              >
                <Minus size={12} aria-hidden />
              </button>
              <span
                className="font-semibold text-stone-900 tabular-nums"
                data-testid="recipe-servings-value"
              >
                {servings}
              </span>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
                onClick={() => onServingsDelta(1)}
                aria-label="Zwiększ liczbę porcji"
              >
                <Plus size={12} aria-hidden />
              </button>
            </div>
          </div>

          {prepTimeMinutes != null && prepTimeMinutes > 0 ? (
            <div className="flex min-w-[100px] flex-col justify-center px-4 lg:px-6">
              <span className="mb-1 flex items-center gap-1 text-[10px] font-bold tracking-wider text-stone-400 uppercase">
                <Timer size={14} aria-hidden /> Przygotowanie
              </span>
              <span className="font-semibold text-stone-900">
                {formatRecipeTime(prepTimeMinutes)}
              </span>
            </div>
          ) : null}

          {cookTimeMinutes != null && cookTimeMinutes > 0 ? (
            <div className="flex min-w-[100px] flex-col justify-center px-4 lg:px-6">
              <span className="mb-1 flex items-center gap-1 text-[10px] font-bold tracking-wider text-stone-400 uppercase">
                <Flame size={14} className="text-orange-500" aria-hidden />{" "}
                Gotowanie
              </span>
              <span className="font-semibold text-stone-900">
                {formatRecipeTime(cookTimeMinutes)}
              </span>
            </div>
          ) : null}

          <div className="flex min-w-[100px] flex-col justify-center px-4 lg:px-6">
            <span className="mb-1 flex items-center gap-1 text-[10px] font-bold tracking-wider text-stone-400 uppercase">
              <ChartBar size={14} aria-hidden /> Trudność
            </span>
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5" aria-hidden>
                {[1, 2, 3].map((bar) => (
                  <div
                    key={bar}
                    className={cn(
                      "h-4 w-2 rounded-sm",
                      bar <= filled ? "bg-emerald-500" : "bg-stone-200",
                    )}
                  />
                ))}
              </div>
              <span className="ml-1 font-semibold text-stone-900">
                {RECIPE_DIFFICULTY_LABELS[difficulty]}
              </span>
            </div>
          </div>
        </div>

        <div className="flex w-full items-center justify-start gap-3 border-t border-stone-100 pt-3 lg:w-auto lg:justify-end lg:border-0 lg:pt-0">
          <button
            type="button"
            onClick={onBuyGaps}
            disabled={gapsPending}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] transition-all hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:opacity-60 lg:flex-none"
            data-testid="recipe-buy-gaps"
          >
            <ShoppingCart size={18} aria-hidden />
            <span>Kup braki</span>
          </button>
          {isAuthor ? (
            <Link
              href={editHref}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm transition-all hover:border-stone-300 hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
            >
              <Pencil size={18} aria-hidden />
              <span className="hidden sm:inline">Edytuj</span>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
