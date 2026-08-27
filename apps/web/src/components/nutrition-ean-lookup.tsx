"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import {
  formatNutritionNumber,
  formatQuantityWithUnit,
  unitLabel,
} from "@/lib/format-quantity";
import { EAN_PATTERN } from "@/lib/product-media";
import { type BaseUnit } from "@/lib/quantity-input";

export type NutritionLookupResult =
  components["schemas"]["NutritionLookupResultDto"];
export type NutritionLookupValues =
  components["schemas"]["NutritionLookupValuesDto"];

export type NutritionFormValues = {
  baseQuantity: string;
  baseUnit: BaseUnit;
  kcal: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
  fiberGrams: string;
  saltGrams: string;
  source: "manual" | "open_food_facts";
  sourceFetchedAt: string | null;
  sourceLabel: string | null;
  sourceBrand: string | null;
};

type NutritionEanLookupProps = {
  kitchenId: string;
  ean: string;
  productUnit: BaseUnit;
  hasExistingValues: boolean;
  onApply: (values: NutritionFormValues) => void;
};

export function draftHasNutritionValues(values: {
  kcal: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
  fiberGrams?: string;
  saltGrams?: string;
}): boolean {
  return [
    values.kcal,
    values.proteinGrams,
    values.carbsGrams,
    values.fatGrams,
    values.fiberGrams ?? "",
    values.saltGrams ?? "",
  ].some((value) => value.trim().length > 0);
}

export function NutritionEanLookup({
  kitchenId,
  ean,
  productUnit,
  hasExistingValues,
  onApply,
}: NutritionEanLookupProps) {
  const [preview, setPreview] = useState<NutritionLookupResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const eanValid = EAN_PATTERN.test(ean.trim());

  const lookup = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/nutrition-lookups/by-ean",
        {
          params: {
            path: { kitchenId },
            query: { ean: ean.trim() },
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać danych z Open Food Facts."),
        );
      }
      if (!data) {
        throw new Error("Brak odpowiedzi z wyszukiwania wartości odżywczych.");
      }
      return data;
    },
    onSuccess: (data) => {
      setPreview(data);
    },
  });

  function tryApply() {
    if (!preview?.nutrition) {
      return;
    }
    if (preview.nutrition.baseUnit !== productUnit) {
      return;
    }
    if (hasExistingValues) {
      setConfirmOpen(true);
      return;
    }
    applyPreview();
  }

  function applyPreview() {
    const nutrition = preview?.nutrition;
    if (!nutrition) {
      return;
    }
    onApply({
      baseQuantity: formatNutritionNumber(nutrition.baseQuantity, 3),
      baseUnit: nutrition.baseUnit,
      kcal: formatNutritionNumber(nutrition.kcal, 3),
      proteinGrams: formatNutritionNumber(nutrition.proteinGrams, 3),
      carbsGrams: formatNutritionNumber(nutrition.carbsGrams, 3),
      fatGrams: formatNutritionNumber(nutrition.fatGrams, 3),
      fiberGrams: nutrition.fiberGrams
        ? formatNutritionNumber(nutrition.fiberGrams, 3)
        : "",
      saltGrams: nutrition.saltGrams
        ? formatNutritionNumber(nutrition.saltGrams, 3)
        : "",
      source: "open_food_facts",
      sourceFetchedAt: preview.fetchedAt,
      sourceLabel: preview.productName ?? null,
      sourceBrand: preview.brand ?? null,
    });
    setConfirmOpen(false);
  }

  const unitMismatch =
    preview?.status === "found" &&
    preview.nutrition != null &&
    preview.nutrition.baseUnit !== productUnit;

  return (
    <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900">
            Open Food Facts
          </p>
          <p className="text-xs text-gray-500">
            Pobierz wartości po EAN. Nazwa, jednostka, cena i zdjęcie produktu
            nie zmieniają się automatycznie.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!eanValid || lookup.isPending}
          onClick={() => {
            setPreview(null);
            lookup.mutate();
          }}
        >
          {lookup.isPending ? "Pobieranie…" : "Pobierz wartości po EAN"}
        </Button>
      </div>

      {!eanValid ? (
        <p className="text-xs text-gray-500">
          Wpisz poprawny EAN (8, 12, 13 albo 14 cyfr), aby włączyć pobieranie.
        </p>
      ) : null}

      {lookup.isError ? (
        <p className="text-sm text-red-600" role="alert">
          {readApiError(lookup.error)}
        </p>
      ) : null}

      {preview ? (
        <div className="space-y-2 rounded-lg border border-white bg-white/80 p-3 text-sm">
          <p className="font-medium text-gray-900">{preview.message}</p>
          {preview.productName || preview.brand ? (
            <dl className="grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
              {preview.productName ? (
                <div>
                  <dt className="text-gray-400">Znaleziony produkt</dt>
                  <dd className="font-medium text-gray-800">
                    {preview.productName}
                  </dd>
                </div>
              ) : null}
              {preview.brand ? (
                <div>
                  <dt className="text-gray-400">Marka</dt>
                  <dd className="font-medium text-gray-800">{preview.brand}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {preview.nutrition ? (
            <>
              <p className="text-xs text-gray-600">
                Baza:{" "}
                {formatQuantityWithUnit(
                  preview.nutrition.baseQuantity,
                  preview.nutrition.baseUnit,
                )}
              </p>
              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
                <div>
                  kcal:{" "}
                  <span className="font-medium">
                    {formatNutritionNumber(preview.nutrition.kcal, 0)}
                  </span>
                </div>
                <div>
                  białko:{" "}
                  <span className="font-medium">
                    {formatNutritionNumber(preview.nutrition.proteinGrams)} g
                  </span>
                </div>
                <div>
                  tłuszcz:{" "}
                  <span className="font-medium">
                    {formatNutritionNumber(preview.nutrition.fatGrams)} g
                  </span>
                </div>
                <div>
                  węglowodany:{" "}
                  <span className="font-medium">
                    {formatNutritionNumber(preview.nutrition.carbsGrams)} g
                  </span>
                </div>
                {preview.nutrition.fiberGrams ? (
                  <div>
                    błonnik:{" "}
                    <span className="font-medium">
                      {formatNutritionNumber(preview.nutrition.fiberGrams)} g
                    </span>
                  </div>
                ) : null}
                {preview.nutrition.saltGrams ? (
                  <div>
                    sól:{" "}
                    <span className="font-medium">
                      {formatNutritionNumber(preview.nutrition.saltGrams)} g
                    </span>
                  </div>
                ) : null}
                {preview.nutrition.sugarsGrams ? (
                  <div>
                    cukry:{" "}
                    <span className="font-medium">
                      {formatNutritionNumber(preview.nutrition.sugarsGrams)} g
                    </span>
                  </div>
                ) : null}
                {preview.nutrition.saturatedFatGrams ? (
                  <div>
                    kwasy nasycone:{" "}
                    <span className="font-medium">
                      {formatNutritionNumber(
                        preview.nutrition.saturatedFatGrams,
                      )}{" "}
                      g
                    </span>
                  </div>
                ) : null}
              </dl>
            </>
          ) : null}

          {unitMismatch && preview.nutrition ? (
            <p className="text-sm text-amber-700" role="status">
              Dane OFF są na {unitLabel(preview.nutrition.baseUnit)}, a produkt
              ma jednostkę {unitLabel(productUnit)}. Nie przeliczamy g↔ml ani na
              sztuki — zmień jednostkę produktu albo wpisz wartości ręcznie.
            </p>
          ) : null}

          {preview.status === "found" && preview.nutrition && !unitMismatch ? (
            <Button type="button" size="sm" onClick={tryApply}>
              Użyj danych
            </Button>
          ) : null}

          <p className="text-[11px] text-gray-400">
            Dane: {preview.attribution} ·{" "}
            <a
              className="underline"
              href="https://world.openfoodfacts.org"
              target="_blank"
              rel="noreferrer"
            >
              openfoodfacts.org
            </a>{" "}
            (ODbL)
          </p>
        </div>
      ) : null}

      {confirmOpen ? (
        <ConfirmDialog
          title="Zastąpić wpisane wartości?"
          description="Formularz ma już wartości odżywcze. Użycie danych z Open Food Facts nadpisze je w formularzu. Zapis do bazy nastąpi dopiero po kliknięciu zapisu produktu."
          confirmLabel="Zastąp wartości"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={applyPreview}
        />
      ) : null}
    </div>
  );
}
