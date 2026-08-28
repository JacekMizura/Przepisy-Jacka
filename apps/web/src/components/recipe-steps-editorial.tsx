"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useMemo } from "react";

import { formatRecipeTime } from "@/lib/recipe-labels";
import { mediaDisplayUrl } from "@/lib/media-upload";
import { cn } from "@/lib/utils";

type Step = components["schemas"]["RecipeStepDto"];

type RecipeStepsEditorialProps = {
  steps: Step[];
  doneStepIds: Set<string>;
  onToggleStep: (id: string) => void;
  onPreview: (src: string, alt: string) => void;
};

export function RecipeStepsEditorial({
  steps,
  doneStepIds,
  onToggleStep,
  onPreview,
}: RecipeStepsEditorialProps) {
  const sorted = useMemo(
    () => steps.slice().sort((left, right) => left.sortOrder - right.sortOrder),
    [steps],
  );

  const doneCount = sorted.filter((step) => doneStepIds.has(step.id)).length;

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-stone-200/80 pb-4">
        <div>
          <h2 className="font-serif text-2xl tracking-tight text-stone-900">
            Przygotowanie
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Kroki w kolejności — odznaczaj w miarę gotowania.
          </p>
        </div>
        <p className="recipe-print-hide text-sm font-medium text-emerald-800">
          {doneCount} / {sorted.length} wykonane
        </p>
      </div>

      <ol className="space-y-10">
        {sorted.map((step, index) => {
          const done = doneStepIds.has(step.id);
          const stepImageUrl = mediaDisplayUrl(step.image);
          const tip = step.tip?.trim() ?? "";
          const heading = step.title
            ? `Krok ${index + 1} · ${step.title}`
            : `Krok ${index + 1}`;

          return (
            <li
              key={step.id}
              className={cn(
                "scroll-mt-8",
                done && "opacity-80",
              )}
            >
              <div className="mb-3 flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-sm font-semibold text-emerald-50">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3
                      className={cn(
                        "font-serif text-xl leading-snug text-stone-900 sm:text-[1.35rem]",
                        done && "text-stone-500 line-through",
                      )}
                    >
                      {heading}
                    </h3>
                    <label className="recipe-print-hide inline-flex cursor-pointer items-center gap-2 text-sm text-stone-600">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => onToggleStep(step.id)}
                        aria-label={`${heading} wykonany`}
                        className="h-5 w-5 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
                      />
                      Zrobione
                    </label>
                  </div>
                  {step.durationMinutes ? (
                    <p className="mt-1 text-xs font-medium tracking-wide text-emerald-800 uppercase">
                      {formatRecipeTime(step.durationMinutes)}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4 sm:pl-12">
                <p
                  className={cn(
                    "max-w-prose whitespace-pre-wrap text-[15px] leading-7 text-stone-700 sm:text-base sm:leading-8",
                    done && "text-stone-500",
                  )}
                >
                  {step.instruction}
                </p>

                {tip ? (
                  <aside className="max-w-prose rounded-2xl border border-emerald-200/70 bg-emerald-50/50 px-4 py-3">
                    <p className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                      Wskazówka
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                      {tip}
                    </p>
                  </aside>
                ) : null}

                {stepImageUrl ? (
                  <button
                    type="button"
                    className="block w-full overflow-hidden bg-stone-100 text-left"
                    onClick={() =>
                      onPreview(stepImageUrl, heading)
                    }
                    aria-label={`Powiększ zdjęcie: ${heading}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć */}
                    <img
                      src={stepImageUrl}
                      alt=""
                      className="max-h-[28rem] w-full object-cover"
                    />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
