"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatRecipeTime,
  formatTotalRecipeTime,
  RECIPE_DIFFICULTY_LABELS,
} from "@/lib/recipe-labels";
import { cn } from "@/lib/utils";

type Difficulty = keyof typeof RECIPE_DIFFICULTY_LABELS;

type RecipeDetailMetaProps = {
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  difficulty: Difficulty;
  onServingsDelta: (delta: number) => void;
};

export function RecipeDetailMeta({
  servings,
  prepTimeMinutes,
  cookTimeMinutes,
  difficulty,
  onServingsDelta,
}: RecipeDetailMetaProps) {
  return (
    <div className="mb-8 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-stone-200/80 py-5 sm:grid-cols-5 sm:gap-6">
      <div className="col-span-2 sm:col-span-1">
        <p className="text-[11px] font-medium tracking-[0.14em] text-stone-500 uppercase">
          Porcje
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="recipe-print-hide h-8 w-8 p-0"
            onClick={() => onServingsDelta(-1)}
            disabled={servings <= 1}
            aria-label="Zmniejsz liczbę porcji"
          >
            <Minus size={14} />
          </Button>
          <span className="min-w-8 text-center text-lg font-semibold text-stone-900">
            {servings}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="recipe-print-hide h-8 w-8 p-0"
            onClick={() => onServingsDelta(1)}
            aria-label="Zwiększ liczbę porcji"
          >
            <Plus size={14} />
          </Button>
        </div>
      </div>
      <MetaItem
        label="Przygotowanie"
        value={formatRecipeTime(prepTimeMinutes)}
      />
      <MetaItem label="Gotowanie" value={formatRecipeTime(cookTimeMinutes)} />
      <MetaItem
        label="Łącznie"
        value={formatTotalRecipeTime(prepTimeMinutes, cookTimeMinutes)}
      />
      <MetaItem
        label="Trudność"
        value={RECIPE_DIFFICULTY_LABELS[difficulty]}
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}

function MetaItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <p className="text-[11px] font-medium tracking-[0.14em] text-stone-500 uppercase">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-stone-900">{value}</p>
    </div>
  );
}
