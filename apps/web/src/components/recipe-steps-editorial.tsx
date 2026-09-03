"use client";

import type { components } from "@moja-kuchnia/api-client";
import { Lightbulb } from "lucide-react";
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

  if (sorted.length === 0) {
    return (
      <section data-testid="recipe-steps-empty">
        <h2 className="font-serif mb-4 text-2xl font-semibold text-stone-900">
          Sposób przygotowania
        </h2>
        <p className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
          Ten przepis nie ma jeszcze zapisanych kroków.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="recipe-steps-panel">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl font-semibold text-stone-900">
          Sposób przygotowania
        </h2>
        <div className="recipe-print-hide rounded-full border border-stone-200 bg-stone-100 px-4 py-1.5 text-sm font-medium text-stone-600">
          <span className="font-bold text-emerald-600">{doneCount}</span>
          {" / "}
          {sorted.length} wykonane
        </div>
      </div>

      <ol className="space-y-6">
        {sorted.map((step, index) => {
          const done = doneStepIds.has(step.id);
          const stepImageUrl = mediaDisplayUrl(step.image);
          const tip = step.tip?.trim() ?? "";
          const title =
            step.title?.trim() || `Krok ${index + 1}`;
          const isLast = index === sorted.length - 1;
          const checkboxId = `step-${step.id}`;

          return (
            <li
              key={step.id}
              className={cn(
                "group relative flex gap-4 overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 transition-all duration-200 sm:gap-6 sm:p-8",
                "hover:-translate-y-0.5 hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)]",
                done && "opacity-70",
              )}
            >
              <div className="flex shrink-0 flex-col items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border text-lg font-bold transition-colors duration-300",
                    done
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-emerald-200 bg-emerald-100 text-emerald-700 group-hover:border-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
                  )}
                >
                  {index + 1}
                </div>
                {!isLast ? (
                  <div
                    className="w-px flex-1 bg-stone-100 transition-colors group-hover:bg-emerald-100"
                    aria-hidden
                  />
                ) : null}
              </div>

              <div className="min-w-0 flex-1 pb-2">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3
                      className={cn(
                        "text-lg font-semibold text-stone-900 sm:text-xl",
                        done && "text-stone-500 line-through",
                      )}
                    >
                      {title}
                    </h3>
                    {step.durationMinutes ? (
                      <p className="mt-1 text-xs font-medium tracking-wide text-emerald-700 uppercase">
                        {formatRecipeTime(step.durationMinutes)}
                      </p>
                    ) : null}
                  </div>
                  <label
                    htmlFor={checkboxId}
                    className="recipe-print-hide inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 transition-colors hover:bg-stone-100"
                  >
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={done}
                      onChange={() => onToggleStep(step.id)}
                      className="h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-stone-300 bg-white checked:border-emerald-500 checked:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
                    />
                    <span className="hidden text-xs font-medium text-stone-600 sm:inline sm:text-sm">
                      Gotowe
                    </span>
                  </label>
                </div>

                <div
                  className={cn(
                    stepImageUrl
                      ? "mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
                      : "",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-none text-sm leading-loose whitespace-pre-wrap text-stone-600 sm:text-base",
                      done && "text-stone-400",
                    )}
                  >
                    {step.instruction}
                  </div>
                  {stepImageUrl ? (
                    <button
                      type="button"
                      className="h-32 overflow-hidden rounded-xl border border-stone-200 sm:h-auto sm:min-h-[10rem]"
                      onClick={() => onPreview(stepImageUrl, title)}
                      aria-label={`Powiększ zdjęcie: ${title}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={stepImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : null}
                </div>

                {tip ? (
                  <p className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm leading-relaxed font-medium text-emerald-800">
                    <Lightbulb
                      size={16}
                      className="mt-0.5 shrink-0"
                      aria-hidden
                    />
                    <span className="whitespace-pre-wrap">{tip}</span>
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
