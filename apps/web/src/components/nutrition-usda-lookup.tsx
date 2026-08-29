"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import type { NutritionFormValues } from "@/components/nutrition-ean-lookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import {
  formatNutritionNumber,
  formatQuantityWithUnit,
  unitLabel,
} from "@/lib/format-quantity";
import { type BaseUnit } from "@/lib/quantity-input";

type SearchResponse = components["schemas"]["UsdaCatalogSearchResponseDto"];
type SearchItem = components["schemas"]["UsdaCatalogSearchItemDto"];
type SuggestResponse = components["schemas"]["UsdaCatalogSuggestValuesDto"];

type NutritionUsdaLookupProps = {
  kitchenId: string;
  productUnit: BaseUnit;
  hasExistingValues: boolean;
  onApply: (values: NutritionFormValues) => void;
};

export function NutritionUsdaLookup({
  kitchenId,
  productUnit,
  hasExistingValues,
  onApply,
}: NutritionUsdaLookupProps) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selected, setSelected] = useState<SearchItem | null>(null);
  const [pieceGrams, setPieceGrams] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<SuggestResponse | null>(null);

  const search = useQuery({
    queryKey: ["usda-foods", kitchenId, submittedQuery],
    enabled: submittedQuery.trim().length >= 2,
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/usda-foods",
        {
          params: {
            path: { kitchenId },
            query: { q: submittedQuery.trim(), page: 1, pageSize: 20 },
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się wyszukać w katalogu USDA."),
        );
      }
      if (!data) {
        throw new Error("Brak odpowiedzi wyszukiwania katalogu USDA.");
      }
      return data as SearchResponse;
    },
  });

  const suggest = useMutation({
    mutationFn: async (entryId: string) => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/usda-foods/{entryId}/suggest",
        {
          params: {
            path: { kitchenId, entryId },
            query: {
              productUnit,
              ...(productUnit === "piece" && pieceGrams.trim()
                ? { pieceGrams: pieceGrams.trim() }
                : {}),
            },
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się przygotować podglądu wartości."),
        );
      }
      if (!data) {
        throw new Error("Brak podglądu wartości USDA.");
      }
      return data as SuggestResponse;
    },
    onSuccess: (data) => {
      setPreview(data);
    },
  });

  function runSearch() {
    setSelected(null);
    setPreview(null);
    setSubmittedQuery(query.trim());
  }

  function tryApply() {
    if (!preview?.suggested) {
      return;
    }
    if (hasExistingValues) {
      setConfirmOpen(true);
      return;
    }
    applyPreview();
  }

  function applyPreview() {
    const suggested = preview?.suggested;
    if (!suggested) {
      return;
    }
    onApply({
      baseQuantity: formatNutritionNumber(suggested.baseQuantity, 3),
      baseUnit: suggested.baseUnit,
      kcal: formatNutritionNumber(suggested.kcal, 3),
      proteinGrams: formatNutritionNumber(suggested.proteinGrams, 3),
      carbsGrams: formatNutritionNumber(suggested.carbsGrams, 3),
      fatGrams: formatNutritionNumber(suggested.fatGrams, 3),
      fiberGrams: suggested.fiberGrams
        ? formatNutritionNumber(suggested.fiberGrams, 3)
        : "",
      saltGrams: suggested.saltGrams
        ? formatNutritionNumber(suggested.saltGrams, 3)
        : "",
      source: "usda_fdc",
      sourceFetchedAt: suggested.sourceFetchedAt,
      sourceLabel: suggested.sourceLabel,
      sourceBrand: null,
      sourceGenericFoodId: suggested.sourceGenericFoodId,
      sourceFdcId: suggested.sourceFdcId,
      sourcePieceGrams: suggested.sourcePieceGrams,
    });
    setConfirmOpen(false);
  }

  return (
    <div className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/40 p-3">
      <div>
        <p className="text-sm font-medium text-gray-900">
          Wybierz wartości z bazy
        </p>
        <p className="text-xs text-gray-500">
          Katalog USDA (Foundation / SR Legacy) — wartości referencyjne,
          szacunkowe. Nazwa, EAN, jednostka i zapasy nie zmieniają się.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="np. pomidor, jabłko, łosoś…"
          aria-label="Szukaj w katalogu żywności"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              runSearch();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={query.trim().length < 2 || search.isFetching}
          onClick={runSearch}
        >
          {search.isFetching ? "Szukam…" : "Szukaj"}
        </Button>
      </div>

      {productUnit === "piece" ? (
        <div>
          <Label htmlFor="usda-piece-grams">
            Masa części jadalnej 1 szt. (g) — wymagane
          </Label>
          <Input
            id="usda-piece-grams"
            inputMode="decimal"
            value={pieceGrams}
            onChange={(event) => {
              setPieceGrams(event.target.value);
              setPreview(null);
            }}
            placeholder="np. 182"
          />
          <p className="mt-1 text-[11px] text-gray-500">
            Nie zgadujemy masy jabłka ani jajka — podaj ją jawnie.
          </p>
        </div>
      ) : null}

      {search.isError ? (
        <p className="text-sm text-red-600" role="alert">
          {readApiError(search.error)}
        </p>
      ) : null}

      {search.isSuccess && search.data.items.length === 0 ? (
        <p className="text-sm text-gray-600">Brak wyników dla „{submittedQuery}”.</p>
      ) : null}

      {search.isSuccess && search.data.items.length > 0 ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-white bg-white/80 p-2 text-sm">
          {search.data.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`w-full rounded-md px-2 py-1.5 text-left hover:bg-sky-50 ${
                  selected?.id === item.id ? "bg-sky-100" : ""
                }`}
                onClick={() => {
                  setSelected(item);
                  setPreview(null);
                  if (productUnit === "piece" && !pieceGrams.trim()) {
                    return;
                  }
                  suggest.mutate(item.id);
                }}
              >
                <span className="font-medium text-gray-900">
                  {item.polishName}
                </span>
                <span className="block text-xs text-gray-500">
                  {item.variantLabel} · {formatNutritionNumber(item.kcalPer100g, 0)}{" "}
                  kcal/100 g · {item.sourceDataset}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {productUnit === "piece" && selected && !pieceGrams.trim() ? (
        <p className="text-sm text-amber-700" role="status">
          Podaj masę 1 szt. w gramach, potem wybierz wariant ponownie.
        </p>
      ) : null}

      {suggest.isError ? (
        <p className="text-sm text-red-600" role="alert">
          {readApiError(suggest.error)}
        </p>
      ) : null}

      {preview ? (
        <div className="space-y-2 rounded-lg border border-white bg-white/80 p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
            Wartości referencyjne — szacunkowe
          </p>
          <p className="font-medium text-gray-900">
            {preview.entry.polishName}
          </p>
          <p className="text-xs text-gray-600">
            {preview.entry.variantLabel} · {preview.entry.descriptionOriginal}
          </p>
          {preview.compositionMayVaryNote ? (
            <p className="text-xs text-amber-800">
              {preview.compositionMayVaryNote}
            </p>
          ) : null}
          <p className="text-xs text-gray-600">
            Podstawa po przeliczeniu:{" "}
            {formatQuantityWithUnit(
              preview.suggested.baseQuantity,
              preview.suggested.baseUnit,
            )}{" "}
            (produkt: {unitLabel(productUnit)})
          </p>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
            <div>
              kcal:{" "}
              <span className="font-medium">
                {formatNutritionNumber(preview.suggested.kcal, 0)}
              </span>
            </div>
            <div>
              białko:{" "}
              <span className="font-medium">
                {formatNutritionNumber(preview.suggested.proteinGrams)} g
              </span>
            </div>
            <div>
              węglowodany:{" "}
              <span className="font-medium">
                {formatNutritionNumber(preview.suggested.carbsGrams)} g
              </span>
            </div>
            <div>
              tłuszcz:{" "}
              <span className="font-medium">
                {formatNutritionNumber(preview.suggested.fatGrams)} g
              </span>
            </div>
            {preview.suggested.fiberGrams ? (
              <div>
                błonnik:{" "}
                <span className="font-medium">
                  {formatNutritionNumber(preview.suggested.fiberGrams)} g
                </span>
              </div>
            ) : (
              <div className="text-amber-700">błonnik: brak w źródle</div>
            )}
            {preview.suggested.saltGrams ? (
              <div>
                sól:{" "}
                <span className="font-medium">
                  {formatNutritionNumber(preview.suggested.saltGrams)} g
                </span>
              </div>
            ) : (
              <div className="text-amber-700">sól: brak (brak sodu)</div>
            )}
          </dl>
          {preview.entry.carbsApproximate ? (
            <p className="text-[11px] text-gray-500">
              Węglowodany przybliżone ({preview.entry.carbsMethod ?? "—"})
            </p>
          ) : null}
          <p className="text-[11px] text-gray-400">
            Źródło: {preview.entry.sourceDataset} {preview.entry.sourceRelease}{" "}
            · FDC {preview.entry.fdcId} ·{" "}
            <a
              className="underline"
              href={preview.entry.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              FoodData Central
            </a>
          </p>
          <Button type="button" size="sm" onClick={tryApply}>
            Użyj danych
          </Button>
        </div>
      ) : null}

      {confirmOpen ? (
        <ConfirmDialog
          title="Zastąpić wpisane wartości?"
          description="Formularz ma już wartości odżywcze. Użycie danych z katalogu USDA nadpisze je w formularzu. Zapis do bazy nastąpi dopiero po kliknięciu zapisu produktu."
          confirmLabel="Zastąp wartości"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={applyPreview}
        />
      ) : null}
    </div>
  );
}
