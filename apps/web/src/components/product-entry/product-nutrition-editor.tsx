"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useId, useState } from "react";

import {
  draftHasNutritionValues as lookupDraftHasValues,
  NutritionEanLookup,
  type NutritionFormValues,
} from "@/components/nutrition-ean-lookup";
import { NutritionUsdaLookup } from "@/components/nutrition-usda-lookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type ProductNutritionEditorProps = {
  kitchenId: string;
  productUnit: BaseUnit;
  ean: string;
  value: NutritionFormDraft;
  onChange: (next: NutritionFormDraft) => void;
  className?: string;
  /** When true, fields stay visible even before the user picks an action. */
  forceShowFields?: boolean;
};

function toLookupValues(draft: NutritionFormDraft): NutritionFormValues {
  return draft;
}

export function ProductNutritionEditor({
  kitchenId,
  productUnit,
  ean,
  value,
  onChange,
  className,
  forceShowFields = false,
}: ProductNutritionEditorProps) {
  const id = useId();
  const [manualOpen, setManualOpen] = useState(
    () => forceShowFields || draftHasNutritionValues(value),
  );
  const [eanPanelOpen, setEanPanelOpen] = useState(false);
  const [usdaPanelOpen, setUsdaPanelOpen] = useState(false);

  const showFields =
    forceShowFields ||
    manualOpen ||
    draftHasNutritionValues(value) ||
    value.source === "open_food_facts" ||
    value.source === "usda_fdc";

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
    setManualOpen(true);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Wartości odżywcze
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Opcjonalne — z nich liczymy kalorie i makro w przepisach. Lookup tylko
          wypełnia formularz; zapis następuje przy zapisie produktu.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={manualOpen || showFields ? "secondary" : "outline"}
          onClick={() => {
            setManualOpen(true);
            if (!draftHasNutritionValues(value)) {
              onChange({
                ...createEmptyNutritionDraft(productUnit),
                baseUnit: productUnit,
              });
            }
          }}
        >
          Wpisz ręcznie
        </Button>
        <Button
          type="button"
          size="sm"
          variant={eanPanelOpen ? "secondary" : "outline"}
          onClick={() => {
            setEanPanelOpen((open) => !open);
            setUsdaPanelOpen(false);
          }}
        >
          Pobierz po EAN
        </Button>
        <Button
          type="button"
          size="sm"
          variant={usdaPanelOpen ? "secondary" : "outline"}
          onClick={() => {
            setUsdaPanelOpen((open) => !open);
            setEanPanelOpen(false);
          }}
        >
          Wybierz z bazy produktów
        </Button>
      </div>

      {eanPanelOpen ? (
        <NutritionEanLookup
          kitchenId={kitchenId}
          ean={ean}
          productUnit={productUnit}
          hasExistingValues={lookupDraftHasValues(toLookupValues(value))}
          onApply={applyLookup}
        />
      ) : null}

      {usdaPanelOpen ? (
        <NutritionUsdaLookup
          kitchenId={kitchenId}
          productUnit={productUnit}
          hasExistingValues={lookupDraftHasValues(toLookupValues(value))}
          onApply={applyLookup}
        />
      ) : null}

      {value.source === "open_food_facts" ? (
        <p className="text-xs text-emerald-700">
          Formularz wypełniony danymi Open Food Facts
          {value.sourceLabel ? ` („${value.sourceLabel}”)` : ""}. Zapis
          zatwierdzisz przy zapisie produktu.
        </p>
      ) : null}

      {value.source === "usda_fdc" ? (
        <p className="text-xs text-sky-800">
          Formularz wypełniony danymi USDA (wartości referencyjne — szacunkowe)
          {value.sourceLabel ? ` („${value.sourceLabel}”)` : ""}. Zapis
          zatwierdzisz przy zapisie produktu.
        </p>
      ) : null}

      {showFields ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-base`}>Ilość odniesienia</Label>
              <div className="flex gap-2">
                <Input
                  id={`${id}-base`}
                  inputMode="decimal"
                  value={value.baseQuantity}
                  onChange={(event) =>
                    updateField({ baseQuantity: event.target.value })
                  }
                  className="flex-1"
                />
                <select
                  aria-label="Jednostka odniesienia"
                  className="rounded-lg border border-gray-200 bg-white px-2 text-sm"
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
              <Label htmlFor={`${id}-kcal`}>kcal</Label>
              <Input
                id={`${id}-kcal`}
                inputMode="decimal"
                placeholder="np. 64"
                value={value.kcal}
                onChange={(event) => updateField({ kcal: event.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`${id}-protein`}>Białko (g)</Label>
              <Input
                id={`${id}-protein`}
                inputMode="decimal"
                value={value.proteinGrams}
                onChange={(event) =>
                  updateField({ proteinGrams: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor={`${id}-carbs`}>Węglowodany (g)</Label>
              <Input
                id={`${id}-carbs`}
                inputMode="decimal"
                value={value.carbsGrams}
                onChange={(event) =>
                  updateField({ carbsGrams: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor={`${id}-fat`}>Tłuszcz (g)</Label>
              <Input
                id={`${id}-fat`}
                inputMode="decimal"
                value={value.fatGrams}
                onChange={(event) =>
                  updateField({ fatGrams: event.target.value })
                }
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-fiber`}>Błonnik (g, opcjonalnie)</Label>
              <Input
                id={`${id}-fiber`}
                inputMode="decimal"
                value={value.fiberGrams}
                onChange={(event) =>
                  updateField({ fiberGrams: event.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor={`${id}-salt`}>Sól (g, opcjonalnie)</Label>
              <Input
                id={`${id}-salt`}
                inputMode="decimal"
                value={value.saltGrams}
                onChange={(event) =>
                  updateField({ saltGrams: event.target.value })
                }
              />
            </div>
          </div>
          {draftHasNutritionValues(value) ? (
            <button
              type="button"
              className="text-xs font-medium text-gray-500 hover:text-red-700 hover:underline"
              onClick={() => {
                onChange(createEmptyNutritionDraft(productUnit));
                setManualOpen(false);
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
