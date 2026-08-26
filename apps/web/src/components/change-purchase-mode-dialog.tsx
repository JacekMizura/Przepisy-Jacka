"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError, UNIT_LABELS } from "@/lib/errors";
import {
  formatPackagePurchase,
  formatQuantityWithUnit,
  toApiQuantityString,
} from "@/lib/format-quantity";
import { type BaseUnit } from "@/lib/quantity-input";
import { formatRequiredForRecipe } from "@/lib/shopping-labels";
import { cn } from "@/lib/utils";

type ShoppingListItem = components["schemas"]["ShoppingListItemDto"];
type PurchaseOption = components["schemas"]["PurchaseOptionDto"];

type ChangePurchaseModeDialogProps = {
  kitchenId: string;
  item: ShoppingListItem;
  onClose: () => void;
};

function packageCountForNeed(
  needQuantity: string | null | undefined,
  contentQuantity: string,
): number {
  const need = Number(needQuantity);
  const content = Number(contentQuantity);
  if (!Number.isFinite(need) || need <= 0 || !Number.isFinite(content) || content <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(need / content));
}

function defaultUnitFromItem(item: ShoppingListItem): BaseUnit {
  const unit =
    item.product?.defaultUnit ??
    item.requiredUnit ??
    item.plannedUnit ??
    "piece";
  if (unit === "gram" || unit === "kilogram") {
    return "gram";
  }
  if (unit === "milliliter" || unit === "liter") {
    return "milliliter";
  }
  return "piece";
}

export function ChangePurchaseModeDialog({
  kitchenId,
  item,
  onClose,
}: ChangePurchaseModeDialogProps) {
  const queryClient = useQueryClient();
  const productId = item.productId!;
  const productName = item.product?.name ?? item.customName ?? "Produkt";
  const defaultUnit = defaultUnitFromItem(item);
  const needQuantity = item.requiredQuantity ?? item.plannedQuantity;
  const requiredHint = formatRequiredForRecipe(
    item.requiredQuantity,
    item.requiredUnit,
  );

  const [modeChoice, setModeChoice] = useState<"packaged" | "exact" | null>(
    null,
  );
  const [selectedOptionId, setSelectedOptionId] = useState<string>("");
  const [creatingOption, setCreatingOption] = useState(false);
  const [optionName, setOptionName] = useState("Karton 1 l");
  const [optionQuantity, setOptionQuantity] = useState("");
  const [optionUnit, setOptionUnit] = useState<BaseUnit>(defaultUnit);
  const [error, setError] = useState<string | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["purchase-options", kitchenId, productId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error: apiError } = await client.GET(
        "/api/kitchens/{kitchenId}/products/{productId}/purchase-options",
        { params: { path: { kitchenId, productId } } },
      );
      if (apiError) {
        throw new Error(
          readApiError(apiError, "Nie udało się pobrać opcji zakupu."),
        );
      }
      return data ?? [];
    },
  });

  const options = optionsQuery.data ?? [];
  const activeOptions = options.filter((option) => option.isActive);

  const selectedOption: PurchaseOption | undefined = useMemo(() => {
    if (selectedOptionId) {
      return activeOptions.find((option) => option.id === selectedOptionId);
    }
    return (
      activeOptions.find((option) => option.isDefault) ?? activeOptions[0]
    );
  }, [activeOptions, selectedOptionId]);

  const packageCount = selectedOption
    ? packageCountForNeed(needQuantity, selectedOption.contentQuantity)
    : 1;

  const exactPreview = formatQuantityWithUnit(
    needQuantity,
    item.requiredUnit ?? item.plannedUnit ?? defaultUnit,
  );

  const packagePreview = selectedOption
    ? formatPackagePurchase(
        packageCount,
        selectedOption.name,
        null,
        null,
      )
    : null;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["shopping-list", kitchenId] });
    queryClient.invalidateQueries({
      queryKey: ["purchase-options", kitchenId, productId],
    });
    queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
  }

  const savePackaged = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      let optionId = selectedOption?.id;
      let contentQuantity = selectedOption?.contentQuantity;

      if (creatingOption || !optionId) {
        if (!optionName.trim() || !optionQuantity.trim()) {
          throw new Error("Podaj nazwę i zawartość opakowania.");
        }
        const { data, error: apiError } = await client.POST(
          "/api/kitchens/{kitchenId}/products/{productId}/configure-purchase",
          {
            params: { path: { kitchenId, productId } },
            body: {
              mode: "packaged",
              option: {
                name: optionName.trim(),
                contentQuantity: toApiQuantityString(optionQuantity),
                contentUnit: optionUnit,
                isDefault: true,
              },
            },
          },
        );
        if (apiError) {
          throw new Error(
            readApiError(apiError, "Nie udało się ustawić opakowania."),
          );
        }
        const created = data?.purchaseOptions?.find(
          (option) => option.isDefault,
        );
        optionId = created?.id;
        contentQuantity = created?.contentQuantity;
        if (!optionId || !contentQuantity) {
          const { data: listedOptions, error: listError } = await client.GET(
            "/api/kitchens/{kitchenId}/products/{productId}/purchase-options",
            { params: { path: { kitchenId, productId } } },
          );
          if (listError) {
            throw new Error(
              readApiError(listError, "Nie udało się pobrać opcji zakupu."),
            );
          }
          const fallback =
            listedOptions?.find((option) => option.isDefault) ??
            listedOptions?.[0];
          optionId = fallback?.id;
          contentQuantity = fallback?.contentQuantity;
        }
        if (!optionId || !contentQuantity) {
          throw new Error("Nie znaleziono utworzonego opakowania.");
        }
      } else if (item.product?.purchaseMode !== "packaged") {
        const { error: modeError } = await client.PATCH(
          "/api/kitchens/{kitchenId}/products/{productId}",
          {
            params: { path: { kitchenId, productId } },
            body: { purchaseMode: "packaged" },
          },
        );
        if (modeError) {
          throw new Error(
            readApiError(modeError, "Nie udało się ustawić trybu opakowań."),
          );
        }
      }

      const count = packageCountForNeed(needQuantity, contentQuantity!);
      const { data: patched, error: patchError } = await client.PATCH(
        "/api/kitchens/{kitchenId}/shopping-list/items/{itemId}",
        {
          params: { path: { kitchenId, itemId: item.id } },
          body: {
            purchaseOptionId: optionId!,
            packageCount: count,
          },
        },
      );
      if (patchError) {
        throw new Error(
          readApiError(patchError, "Nie udało się zaktualizować pozycji."),
        );
      }
      return patched;
    },
    onSuccess: () => {
      invalidateAll();
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const saveExact = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { error: configError } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/configure-purchase",
        {
          params: { path: { kitchenId, productId } },
          body: { mode: "exact" },
        },
      );
      if (configError) {
        throw new Error(
          readApiError(configError, "Nie udało się ustawić dokładnej ilości."),
        );
      }

      // Prefer required gap quantity when converting away from packages.
      const quantity = item.requiredQuantity ?? item.plannedQuantity;
      const unit = item.requiredUnit ?? item.plannedUnit ?? defaultUnit;
      if (!quantity || !unit) {
        throw new Error("Brak ilości do zachowania na pozycji listy.");
      }

      const { data, error: patchError } = await client.PATCH(
        "/api/kitchens/{kitchenId}/shopping-list/items/{itemId}",
        {
          params: { path: { kitchenId, itemId: item.id } },
          body: {
            plannedQuantity: quantity,
            plannedUnit: unit,
          },
        },
      );
      if (patchError) {
        throw new Error(
          readApiError(patchError, "Nie udało się zaktualizować pozycji."),
        );
      }
      return data;
    },
    onSuccess: () => {
      invalidateAll();
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const busy = savePackaged.isPending || saveExact.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={() => {
        if (!busy) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-purchase-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="change-purchase-title"
          className="text-lg font-semibold text-gray-900"
        >
          Zmień sposób zakupu
        </h2>
        <p className="mt-1 text-sm text-gray-500">{productName}</p>
        {requiredHint ? (
          <p className="mt-2 text-sm text-amber-800">
            brakuje {requiredHint} do przepisu
          </p>
        ) : null}

        <div className="mt-4 space-y-2">
          <button
            type="button"
            className={cn(
              "w-full rounded-lg border px-3 py-3 text-left transition-colors",
              modeChoice === "packaged"
                ? "border-emerald-300 bg-emerald-50/50 ring-1 ring-emerald-200"
                : "border-gray-100 hover:border-gray-200",
            )}
            onClick={() => {
              setModeChoice("packaged");
              setError(null);
              setCreatingOption(activeOptions.length === 0);
            }}
          >
            <span className="block text-sm font-medium text-gray-900">
              W opakowaniach
            </span>
            <span className="block text-xs text-gray-500">
              Zaktualizuje tę samą pozycję (np. 1 × Karton 1 l).
            </span>
          </button>
          <button
            type="button"
            className={cn(
              "w-full rounded-lg border px-3 py-3 text-left transition-colors",
              modeChoice === "exact"
                ? "border-emerald-300 bg-emerald-50/50 ring-1 ring-emerald-200"
                : "border-gray-100 hover:border-gray-200",
            )}
            onClick={() => {
              setModeChoice("exact");
              setError(null);
            }}
          >
            <span className="block text-sm font-medium text-gray-900">
              Na dokładną ilość
            </span>
            <span className="block text-xs text-gray-500">
              Zachowa świadomie dokładną ilość {exactPreview}.
            </span>
          </button>
        </div>

        {modeChoice === "packaged" ? (
          <div className="mt-4 space-y-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
            {optionsQuery.isPending ? (
              <p className="text-sm text-gray-500">Ładowanie opakowań…</p>
            ) : null}

            {activeOptions.length > 0 && !creatingOption ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Opakowanie</Label>
                  <select
                    className="block w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm"
                    value={selectedOption?.id ?? ""}
                    onChange={(event) =>
                      setSelectedOptionId(event.target.value)
                    }
                  >
                    {activeOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} (
                        {formatQuantityWithUnit(
                          option.contentQuantity,
                          option.contentUnit,
                        )}
                        )
                      </option>
                    ))}
                  </select>
                </div>
                {packagePreview ? (
                  <p className="text-sm text-emerald-800">
                    Po zapisie: <span className="font-semibold">{packagePreview}</span>
                  </p>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCreatingOption(true)}
                >
                  Nowe opakowanie
                </Button>
              </>
            ) : null}

            {creatingOption || activeOptions.length === 0 ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nazwa opakowania</Label>
                  <Input
                    value={optionName}
                    onChange={(event) => setOptionName(event.target.value)}
                    placeholder="np. Karton 1 l"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Zawartość</Label>
                  <div className="flex gap-2">
                    <Input
                      inputMode="decimal"
                      value={optionQuantity}
                      onChange={(event) =>
                        setOptionQuantity(event.target.value)
                      }
                      className="flex-1"
                    />
                    <select
                      className="rounded-lg border border-gray-200 bg-white px-2 text-sm"
                      value={optionUnit}
                      onChange={(event) =>
                        setOptionUnit(event.target.value as BaseUnit)
                      }
                    >
                      {(Object.keys(UNIT_LABELS) as BaseUnit[]).map((unit) => (
                        <option key={unit} value={unit}>
                          {UNIT_LABELS[unit]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {activeOptions.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCreatingOption(false)}
                  >
                    Wybierz istniejące
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {modeChoice === "exact" ? (
          <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm text-amber-950">
            Potwierdzasz zakup dokładnej ilości{" "}
            <span className="font-semibold">{exactPreview}</span> na tej samej
            pozycji listy.
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Anuluj
          </Button>
          <Button
            disabled={busy || !modeChoice}
            onClick={() => {
              setError(null);
              if (modeChoice === "packaged") {
                savePackaged.mutate();
              } else if (modeChoice === "exact") {
                saveExact.mutate();
              }
            }}
          >
            {busy ? "Zapisywanie…" : "Zapisz"}
          </Button>
        </div>
      </div>
    </div>
  );
}
