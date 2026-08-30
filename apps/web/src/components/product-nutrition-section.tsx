"use client";

import type { components } from "@moja-kuchnia/api-client";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  draftHasNutritionValues,
  NutritionEanLookup,
  type NutritionFormValues,
} from "@/components/nutrition-ean-lookup";
import { NutritionUsdaLookup } from "@/components/nutrition-usda-lookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError, UNIT_LABELS } from "@/lib/errors";
import {
  formatNutritionNumber,
  formatQuantityWithUnit,
  toApiQuantityString,
  unitLabel,
} from "@/lib/format-quantity";
import { type BaseUnit } from "@/lib/quantity-input";

type ProductNutrition = components["schemas"]["ProductNutritionDto"];
type UpsertProductNutrition =
  components["schemas"]["UpsertProductNutritionDto"];

type ProductNutritionSectionProps = {
  kitchenId: string;
  productId: string;
  productName: string;
  productEan: string | null;
  defaultUnit: BaseUnit;
  nutrition: ProductNutrition | null;
};

const NUMBER_PATTERN = /^(?:0|[1-9]\d*)(?:[.,]\d{1,3})?$/;

export function ProductNutritionSection({
  kitchenId,
  productId,
  productName,
  productEan,
  defaultUnit,
  nutrition,
}: ProductNutritionSectionProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [eanDraft, setEanDraft] = useState(productEan ?? "");

  const nutritionQuery = useQuery({
    queryKey: ["product-nutrition", kitchenId, productId],
    enabled: editing,
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/products/{productId}/nutrition",
        { params: { path: { kitchenId, productId } } },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać wartości odżywczych."),
        );
      }
      return data ? data : null;
    },
  });

  const save = useMutation({
    mutationFn: async (body: UpsertProductNutrition) => {
      const client = createWebApiClient();
      const { data, error } = await client.PUT(
        "/api/kitchens/{kitchenId}/products/{productId}/nutrition",
        { params: { path: { kitchenId, productId } }, body },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się zapisać wartości odżywczych."),
        );
      }
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["product-nutrition", kitchenId, productId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["products", kitchenId],
      });
      setEditing(false);
    },
  });

  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">
            Wartości odżywcze
          </h3>
          <p className="text-xs text-gray-500">
            Dane dla „{productName}” — z nich liczymy kalorie i makro przepisów.
          </p>
        </div>
        {!editing ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              save.reset();
              setEanDraft(productEan ?? "");
              setEditing(true);
            }}
          >
            {nutrition ? "Edytuj" : "Dodaj dane"}
          </Button>
        ) : null}
      </div>

      {!editing ? <NutritionSummary nutrition={nutrition} /> : null}

      {editing && nutritionQuery.isPending ? (
        <p className="mt-3 text-xs text-gray-500">Wczytywanie danych…</p>
      ) : null}

      {editing && nutritionQuery.isError ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {readApiError(nutritionQuery.error)}
        </p>
      ) : null}

      {editing && nutritionQuery.isSuccess ? (
        <NutritionEditor
          kitchenId={kitchenId}
          productId={productId}
          productName={productName}
          ean={eanDraft}
          onEanChange={setEanDraft}
          defaultUnit={defaultUnit}
          initial={nutritionQuery.data}
          pending={save.isPending}
          saveError={save.isError ? readApiError(save.error) : null}
          onCancel={() => {
            save.reset();
            setEditing(false);
          }}
          onSave={(body) => save.mutate(body)}
        />
      ) : null}
    </div>
  );
}

function NutritionSummary({
  nutrition,
}: {
  nutrition: ProductNutrition | null;
}) {
  if (!nutrition) {
    return (
      <p className="mt-3 text-sm text-gray-500">
        Brak danych — bez nich przepis z tym składnikiem nie pokaże pełnych
        kalorii.
      </p>
    );
  }
  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-gray-900">
        {formatNutritionNumber(nutrition.kcal, 0)} kcal na{" "}
        {formatQuantityWithUnit(nutrition.baseQuantity, nutrition.baseUnit)}
      </p>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        <NutritionFact label="Białko" value={nutrition.proteinGrams} />
        <NutritionFact label="Węglowodany" value={nutrition.carbsGrams} />
        <NutritionFact label="Tłuszcz" value={nutrition.fatGrams} />
        <NutritionFact label="Błonnik" value={nutrition.fiberGrams} />
        <NutritionFact label="Sól" value={nutrition.saltGrams} />
      </dl>
      {nutrition.source === "open_food_facts" ? (
        <p className="mt-2 text-[11px] text-emerald-700">
          Źródło: Open Food Facts
          {nutrition.sourceFetchedAt
            ? ` · pobrano ${new Date(nutrition.sourceFetchedAt).toLocaleString("pl-PL")}`
            : ""}
          {nutrition.sourceLabel ? ` · ${nutrition.sourceLabel}` : ""}
        </p>
      ) : null}
      {nutrition.source === "usda_fdc" ? (
        <p className="mt-2 text-[11px] text-sky-800">
          Źródło: USDA FoodData Central (wartości referencyjne — szacunkowe)
          {nutrition.sourceLabel ? ` · ${nutrition.sourceLabel}` : ""}
          {nutrition.sourceFdcId ? ` · FDC ${nutrition.sourceFdcId}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function NutritionFact({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) {
    return null;
  }
  return (
    <div className="flex gap-1">
      <dt className="text-gray-500">{label}:</dt>
      <dd className="font-medium text-gray-800">
        {formatNutritionNumber(value)}&nbsp;g
      </dd>
    </div>
  );
}

type Draft = NutritionFormValues;

function toDraft(
  nutrition: ProductNutrition | null,
  defaultUnit: BaseUnit,
): Draft {
  if (!nutrition) {
    return {
      baseQuantity: defaultUnit === "piece" ? "1" : "100",
      baseUnit: defaultUnit,
      kcal: "",
      proteinGrams: "",
      carbsGrams: "",
      fatGrams: "",
      fiberGrams: "",
      saltGrams: "",
      source: "manual",
      sourceFetchedAt: null,
      sourceLabel: null,
      sourceBrand: null,
      sourceGenericFoodId: null,
      sourceFdcId: null,
      sourcePieceGrams: null,
    };
  }
  return {
    baseQuantity: formatNutritionNumber(nutrition.baseQuantity, 3),
    baseUnit: nutrition.baseUnit,
    kcal: formatNutritionNumber(nutrition.kcal, 3),
    proteinGrams: formatNutritionNumber(nutrition.proteinGrams, 3),
    carbsGrams: formatNutritionNumber(nutrition.carbsGrams, 3),
    fatGrams: formatNutritionNumber(nutrition.fatGrams, 3),
    fiberGrams: formatNutritionNumber(nutrition.fiberGrams, 3),
    saltGrams: formatNutritionNumber(nutrition.saltGrams, 3),
    source: nutrition.source,
    sourceFetchedAt: nutrition.sourceFetchedAt,
    sourceLabel: nutrition.sourceLabel,
    sourceBrand: nutrition.sourceBrand,
    sourceGenericFoodId: nutrition.sourceGenericFoodId ?? null,
    sourceFdcId: nutrition.sourceFdcId ?? null,
    sourcePieceGrams: nutrition.sourcePieceGrams
      ? formatNutritionNumber(nutrition.sourcePieceGrams, 3)
      : null,
  };
}

function NutritionEditor({
  kitchenId,
  productId,
  productName,
  ean,
  onEanChange,
  defaultUnit,
  initial,
  pending,
  saveError,
  onCancel,
  onSave,
}: {
  kitchenId: string;
  productId: string;
  productName: string;
  ean: string;
  onEanChange: (value: string) => void;
  defaultUnit: BaseUnit;
  initial: ProductNutrition | null;
  pending: boolean;
  saveError: string | null;
  onCancel: () => void;
  onSave: (body: UpsertProductNutrition) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial, defaultUnit));
  const [formError, setFormError] = useState<string | null>(null);

  function updateDraft(patch: Partial<Draft>) {
    setDraft((previous) => {
      const next: Draft = { ...previous, ...patch };
      const touchedValues =
        patch.kcal !== undefined ||
        patch.proteinGrams !== undefined ||
        patch.carbsGrams !== undefined ||
        patch.fatGrams !== undefined ||
        patch.fiberGrams !== undefined ||
        patch.saltGrams !== undefined ||
        patch.baseQuantity !== undefined ||
        patch.baseUnit !== undefined;
      if (touchedValues && patch.source === undefined) {
        next.source = "manual";
        next.sourceFetchedAt = null;
        next.sourceLabel = null;
        next.sourceBrand = null;
        next.sourceGenericFoodId = null;
        next.sourceFdcId = null;
        next.sourcePieceGrams = null;
      }
      return next;
    });
  }

  function applyLookup(values: NutritionFormValues) {
    setDraft(values);
    setFormError(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const baseQuantity = parseRequiredNumber(
      draft.baseQuantity,
      "ilość odniesienia",
    );
    if (!baseQuantity.ok) {
      setFormError(baseQuantity.message);
      return;
    }
    if (Number(baseQuantity.value) <= 0) {
      setFormError("Ilość odniesienia musi być większa od zera.");
      return;
    }
    const kcal = parseRequiredNumber(draft.kcal, "kcal");
    if (!kcal.ok) {
      setFormError(kcal.message);
      return;
    }
    const protein = parseRequiredNumber(draft.proteinGrams, "białko");
    if (!protein.ok) {
      setFormError(protein.message);
      return;
    }
    const carbs = parseRequiredNumber(draft.carbsGrams, "węglowodany");
    if (!carbs.ok) {
      setFormError(carbs.message);
      return;
    }
    const fat = parseRequiredNumber(draft.fatGrams, "tłuszcz");
    if (!fat.ok) {
      setFormError(fat.message);
      return;
    }
    const fiber = parseOptionalNumber(draft.fiberGrams, "błonnik");
    if (!fiber.ok) {
      setFormError(fiber.message);
      return;
    }
    const salt = parseOptionalNumber(draft.saltGrams, "sól");
    if (!salt.ok) {
      setFormError(salt.message);
      return;
    }

    onSave({
      baseQuantity: baseQuantity.value,
      baseUnit: draft.baseUnit,
      kcal: kcal.value,
      proteinGrams: protein.value,
      carbsGrams: carbs.value,
      fatGrams: fat.value,
      fiberGrams: fiber.value,
      saltGrams: salt.value,
      source: draft.source,
      sourceFetchedAt: draft.sourceFetchedAt,
      sourceLabel: draft.sourceLabel,
      sourceBrand: draft.sourceBrand,
      sourceGenericFoodId: draft.sourceGenericFoodId ?? null,
      sourceFdcId: draft.sourceFdcId ?? null,
      sourcePieceGrams: draft.sourcePieceGrams ?? null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div>
        <Label htmlFor={`nutrition-ean-${productId}`}>
          EAN do pobrania (nie zmienia kodu produktu)
        </Label>
        <Input
          id={`nutrition-ean-${productId}`}
          inputMode="numeric"
          value={ean}
          onChange={(event) => onEanChange(event.target.value)}
          placeholder="np. 3017624010701"
        />
      </div>

      <NutritionEanLookup
        kitchenId={kitchenId}
        ean={ean}
        productUnit={defaultUnit}
        hasExistingValues={draftHasNutritionValues(draft)}
        onApply={applyLookup}
      />

      <NutritionUsdaLookup
        kitchenId={kitchenId}
        productUnit={defaultUnit}
        productName={productName}
        hasExistingValues={draftHasNutritionValues(draft)}
        onApply={applyLookup}
      />

      {draft.source === "open_food_facts" ? (
        <p className="text-xs text-emerald-700">
          Formularz wypełniony danymi Open Food Facts
          {draft.sourceLabel ? ` („${draft.sourceLabel}”)` : ""}. Zapis
          zatwierdzisz poniżej.
        </p>
      ) : null}

      {draft.source === "usda_fdc" ? (
        <p className="text-xs text-sky-800">
          Formularz wypełniony danymi USDA (wartości referencyjne — szacunkowe)
          {draft.sourceLabel ? ` („${draft.sourceLabel}”)` : ""}. Zapis
          zatwierdzisz poniżej.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`nutrition-base-${productId}`}>
            Ilość odniesienia
          </Label>
          <div className="flex gap-2">
            <Input
              id={`nutrition-base-${productId}`}
              inputMode="decimal"
              value={draft.baseQuantity}
              onChange={(event) =>
                updateDraft({ baseQuantity: event.target.value })
              }
              className="flex-1"
            />
            <select
              aria-label="Jednostka odniesienia"
              className="rounded-lg border border-gray-200 bg-white px-2 text-sm"
              value={draft.baseUnit}
              onChange={(event) =>
                updateDraft({ baseUnit: event.target.value as BaseUnit })
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
          <Label htmlFor={`nutrition-kcal-${productId}`}>kcal</Label>
          <Input
            id={`nutrition-kcal-${productId}`}
            inputMode="decimal"
            placeholder="np. 64"
            value={draft.kcal}
            onChange={(event) => updateDraft({ kcal: event.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`nutrition-protein-${productId}`}>Białko (g)</Label>
          <Input
            id={`nutrition-protein-${productId}`}
            inputMode="decimal"
            value={draft.proteinGrams}
            onChange={(event) =>
              updateDraft({ proteinGrams: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor={`nutrition-carbs-${productId}`}>
            Węglowodany (g)
          </Label>
          <Input
            id={`nutrition-carbs-${productId}`}
            inputMode="decimal"
            value={draft.carbsGrams}
            onChange={(event) => updateDraft({ carbsGrams: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor={`nutrition-fat-${productId}`}>Tłuszcz (g)</Label>
          <Input
            id={`nutrition-fat-${productId}`}
            inputMode="decimal"
            value={draft.fatGrams}
            onChange={(event) => updateDraft({ fatGrams: event.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`nutrition-fiber-${productId}`}>
            Błonnik (g, opcjonalnie)
          </Label>
          <Input
            id={`nutrition-fiber-${productId}`}
            inputMode="decimal"
            value={draft.fiberGrams}
            onChange={(event) => updateDraft({ fiberGrams: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor={`nutrition-salt-${productId}`}>
            Sól (g, opcjonalnie)
          </Label>
          <Input
            id={`nutrition-salt-${productId}`}
            inputMode="decimal"
            value={draft.saltGrams}
            onChange={(event) => updateDraft({ saltGrams: event.target.value })}
          />
        </div>
      </div>
      {formError ?? saveError ? (
        <p className="text-sm text-red-600" role="alert">
          {formError ?? saveError}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Zapisywanie…" : "Zapisz wartości"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Anuluj
        </Button>
      </div>
    </form>
  );
}

type ParsedNumber<T> = { ok: true; value: T } | { ok: false; message: string };

function invalidNumberMessage(fieldLabel: string): string {
  return `Pole „${fieldLabel}” musi być liczbą nieujemną z maksymalnie 3 miejscami po przecinku.`;
}

function parseRequiredNumber(
  raw: string,
  fieldLabel: string,
): ParsedNumber<string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: `Podaj ${fieldLabel}.` };
  }
  if (!NUMBER_PATTERN.test(trimmed)) {
    return { ok: false, message: invalidNumberMessage(fieldLabel) };
  }
  return { ok: true, value: toApiQuantityString(trimmed) };
}

function parseOptionalNumber(
  raw: string,
  fieldLabel: string,
): ParsedNumber<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (!NUMBER_PATTERN.test(trimmed)) {
    return { ok: false, message: invalidNumberMessage(fieldLabel) };
  }
  return { ok: true, value: toApiQuantityString(trimmed) };
}
