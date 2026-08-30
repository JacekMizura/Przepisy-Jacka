"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ScanBarcode, Search } from "lucide-react";
import { useId, useState } from "react";

import {
  draftHasNutritionValues as lookupDraftHasValues,
  NutritionEanLookup,
  type NutritionFormValues,
} from "@/components/nutrition-ean-lookup";
import { NutritionUsdaLookup } from "@/components/nutrition-usda-lookup";
import { UNIT_LABELS } from "@/lib/errors";
import { unitLabel } from "@/lib/format-quantity";
import {
  buildUpsertProductNutritionDto,
  clearNutritionProvenance,
  createEmptyNutritionDraft,
  draftHasNutritionValues,
  nutritionDraftFromDto,
  type NutritionFormDraft,
  type UpsertProductNutrition,
} from "@/lib/product-nutrition-payload";
import { type BaseUnit } from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

export {
  buildUpsertProductNutritionDto,
  createEmptyNutritionDraft,
  draftHasNutritionValues,
  nutritionDraftFromDto,
  type NutritionFormDraft,
  type UpsertProductNutrition,
};

type ProductNutrition = components["schemas"]["ProductNutritionDto"];

type NutritionMode = "manual" | "ean" | "db";

type ProductNutritionEditorProps = {
  kitchenId: string;
  productUnit: BaseUnit;
  ean: string;
  value: NutritionFormDraft;
  onChange: (next: NutritionFormDraft) => void;
  className?: string;
  /** When true, starts with manual form expanded. */
  defaultOpen?: boolean;
};

function toLookupValues(draft: NutritionFormDraft): NutritionFormValues {
  return draft;
}

const FIELD_CLASS =
  "w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm";

function modeButtonClass(active: boolean): string {
  return cn(
    "px-4 py-2 text-sm font-medium rounded-lg border transition-colors",
    active
      ? "bg-emerald-50 border-emerald-500 text-emerald-700"
      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50",
  );
}

export function ProductNutritionEditor({
  kitchenId,
  productUnit,
  ean,
  value,
  onChange,
  className,
  defaultOpen = false,
}: ProductNutritionEditorProps) {
  const id = useId();
  const hasValues = draftHasNutritionValues(value);
  const [mode, setMode] = useState<NutritionMode | null>(() => {
    if (
      defaultOpen ||
      hasValues ||
      value.source === "open_food_facts" ||
      value.source === "usda_fdc"
    ) {
      return "manual";
    }
    return null;
  });

  function updateField(patch: Partial<NutritionFormDraft>) {
    const touchedValues =
      patch.kcal !== undefined ||
      patch.proteinGrams !== undefined ||
      patch.carbsGrams !== undefined ||
      patch.fatGrams !== undefined ||
      patch.fiberGrams !== undefined ||
      patch.saltGrams !== undefined ||
      patch.baseQuantity !== undefined ||
      patch.baseUnit !== undefined;
    let next: NutritionFormDraft = { ...value, ...patch };
    if (touchedValues && patch.source === undefined) {
      next = clearNutritionProvenance(next);
    }
    onChange(next);
  }

  function applyLookup(values: NutritionFormValues) {
    onChange(values);
    setMode("manual");
  }

  function toggleMode(next: NutritionMode) {
    setMode((current) => (current === next ? null : next));
  }

  return (
    <div
      className={cn(
        "space-y-0 bg-white p-6 rounded-xl shadow-sm border border-gray-200",
        className,
      )}
    >
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900">
          Wartości odżywcze
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Opcjonalne — z nich liczymy kalorie i makro w przepisach. Lookup tylko
          wypełnia formularz; zapis następuje przy zapisie produktu.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => toggleMode("manual")}
          className={modeButtonClass(mode === "manual")}
        >
          Wpisz ręcznie
        </button>
        <button
          type="button"
          onClick={() => toggleMode("ean")}
          className={cn(modeButtonClass(mode === "ean"), "flex items-center gap-2")}
        >
          <ScanBarcode className="h-4 w-4" /> Pobierz po EAN
        </button>
        <button
          type="button"
          onClick={() => toggleMode("db")}
          className={cn(modeButtonClass(mode === "db"), "flex items-center gap-2")}
        >
          <Search className="h-4 w-4" /> Wybierz z bazy produktów
        </button>
      </div>

      {mode === "ean" ? (
        <div className="mt-4">
          <NutritionEanLookup
            kitchenId={kitchenId}
            ean={ean}
            productUnit={productUnit}
            hasExistingValues={lookupDraftHasValues(toLookupValues(value))}
            onApply={applyLookup}
          />
        </div>
      ) : null}

      {mode === "db" ? (
        <div className="mt-4">
          <NutritionUsdaLookup
            kitchenId={kitchenId}
            productUnit={productUnit}
            hasExistingValues={lookupDraftHasValues(toLookupValues(value))}
            onApply={applyLookup}
          />
        </div>
      ) : null}

      {mode === "manual" ? (
        <div className="mt-4 space-y-3">
          {value.source === "open_food_facts" ? (
            <p className="text-xs text-emerald-700">
              Formularz wypełniony danymi Open Food Facts
              {value.sourceLabel ? ` („${value.sourceLabel}”)` : ""}.
            </p>
          ) : null}

          {value.source === "usda_fdc" ? (
            <p className="text-xs text-sky-800">
              Formularz wypełniony danymi USDA (wartości referencyjne —
              szacunkowe)
              {value.sourceLabel ? ` („${value.sourceLabel}”)` : ""}.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${id}-base`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Ilość odniesienia
              </label>
              <div className="flex gap-2">
                <input
                  id={`${id}-base`}
                  inputMode="decimal"
                  value={value.baseQuantity}
                  onChange={(event) =>
                    updateField({ baseQuantity: event.target.value })
                  }
                  className={cn(FIELD_CLASS, "flex-1")}
                />
                <select
                  aria-label="Jednostka odniesienia"
                  className={cn(FIELD_CLASS, "w-28 bg-white")}
                  value={value.baseUnit}
                  onChange={(event) =>
                    updateField({
                      baseUnit: event.target.value as BaseUnit,
                    })
                  }
                >
                  {(Object.keys(UNIT_LABELS) as BaseUnit[]).map((unit) => (
                    <option key={unit} value={unit}>
                      {unitLabel(unit)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Zwykle 100 g / 100 ml albo 1 szt.
              </p>
            </div>
            <div>
              <label
                htmlFor={`${id}-kcal`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                kcal
              </label>
              <input
                id={`${id}-kcal`}
                inputMode="decimal"
                placeholder="np. 64"
                value={value.kcal}
                onChange={(event) => updateField({ kcal: event.target.value })}
                className={FIELD_CLASS}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor={`${id}-protein`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Białko (g)
              </label>
              <input
                id={`${id}-protein`}
                inputMode="decimal"
                value={value.proteinGrams}
                onChange={(event) =>
                  updateField({ proteinGrams: event.target.value })
                }
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label
                htmlFor={`${id}-carbs`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Węglowodany (g)
              </label>
              <input
                id={`${id}-carbs`}
                inputMode="decimal"
                value={value.carbsGrams}
                onChange={(event) =>
                  updateField({ carbsGrams: event.target.value })
                }
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label
                htmlFor={`${id}-fat`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Tłuszcz (g)
              </label>
              <input
                id={`${id}-fat`}
                inputMode="decimal"
                value={value.fatGrams}
                onChange={(event) =>
                  updateField({ fatGrams: event.target.value })
                }
                className={FIELD_CLASS}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${id}-fiber`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Błonnik (g, opcjonalnie)
              </label>
              <input
                id={`${id}-fiber`}
                inputMode="decimal"
                value={value.fiberGrams}
                onChange={(event) =>
                  updateField({ fiberGrams: event.target.value })
                }
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label
                htmlFor={`${id}-salt`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Sól (g, opcjonalnie)
              </label>
              <input
                id={`${id}-salt`}
                inputMode="decimal"
                value={value.saltGrams}
                onChange={(event) =>
                  updateField({ saltGrams: event.target.value })
                }
                className={FIELD_CLASS}
              />
            </div>
          </div>
          {hasValues ? (
            <button
              type="button"
              className="text-xs font-medium text-gray-500 hover:text-red-700 hover:underline"
              onClick={() => {
                onChange(createEmptyNutritionDraft(productUnit));
              }}
            >
              Wyczyść wartości odżywcze
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function initialNutritionDraft(
  nutrition: ProductNutrition | null | undefined,
  defaultUnit: BaseUnit,
): NutritionFormDraft {
  return nutritionDraftFromDto(nutrition, defaultUnit);
}
