"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { formatQuantityNumber, unitLabel } from "@/lib/format-quantity";
import { type BaseUnit } from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

type PurchaseMode = components["schemas"]["ProductDto"]["purchaseMode"];
type Product = components["schemas"]["ProductDto"];

type ProductPurchaseOptionsProps = {
  kitchenId: string;
  productId: string;
  defaultUnit: BaseUnit;
  purchaseMode: PurchaseMode;
  /** Wielkość opakowania SKU — pokazywana zamiast listy profili. */
  packageQuantity?: string | null;
  packageUnit?: string | null;
};

const MODE_CHOICES: Array<{
  value: Exclude<PurchaseMode, "unconfigured">;
  title: string;
  description: string;
}> = [
  {
    value: "packaged",
    title: "W opakowaniach",
    description: "Kupujesz pełne opakowania tego produktu (SKU).",
  },
  {
    value: "exact",
    title: "Na wagę / luzem",
    description:
      "Przy każdym zakupie wpiszesz rzeczywistą wagę lub objętość.",
  },
];

export function ProductPurchaseOptions({
  kitchenId,
  productId,
  purchaseMode,
  packageQuantity,
  packageUnit,
}: ProductPurchaseOptionsProps) {
  const queryClient = useQueryClient();
  const [modeError, setModeError] = useState<string | null>(null);

  const effectiveMode: Exclude<PurchaseMode, "unconfigured"> | "unconfigured" =
    purchaseMode === "packaged" || purchaseMode === "exact"
      ? purchaseMode
      : "unconfigured";

  const setPurchaseMode = useMutation({
    mutationFn: async (mode: Exclude<PurchaseMode, "unconfigured">) => {
      const client = createWebApiClient();
      const { data, error } = await client.PATCH(
        "/api/kitchens/{kitchenId}/products/{productId}",
        {
          params: { path: { kitchenId, productId } },
          body: { purchaseMode: mode },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się zmienić sposobu zakupu."),
        );
      }
      return data as Product;
    },
    onSuccess: () => {
      setModeError(null);
      void queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
    },
    onError: (error: Error) => {
      setModeError(error.message);
    },
  });

  const packageLabel =
    packageQuantity && packageUnit
      ? `${formatQuantityNumber(packageQuantity)}\u00A0${unitLabel(packageUnit)} w opakowaniu`
      : null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">
        Jak kupuję ten produkt
      </h3>
      {packageLabel ? (
        <p className="text-sm text-gray-600">Wielkość produktu: {packageLabel}</p>
      ) : (
        <p className="text-sm text-amber-700">
          Ustaw „Ilość w opakowaniu” powyżej, aby kupować w opakowaniach.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {MODE_CHOICES.map((choice) => {
          const selected = effectiveMode === choice.value;
          const disabled =
            choice.value === "packaged" &&
            (!packageQuantity || !packageUnit) &&
            purchaseMode !== "packaged";
          return (
            <button
              key={choice.value}
              type="button"
              disabled={disabled || setPurchaseMode.isPending}
              aria-pressed={selected}
              onClick={() => setPurchaseMode.mutate(choice.value)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-colors",
                selected
                  ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200"
                  : "border-gray-200 bg-white hover:border-gray-300",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="block text-sm font-semibold text-gray-900">
                {choice.title}
              </span>
              <span className="mt-1 block text-xs text-gray-500">
                {choice.description}
              </span>
            </button>
          );
        })}
      </div>
      {effectiveMode === "unconfigured" ? (
        <p className="text-xs text-gray-500">
          Wybierz sposób zakupu przed dodaniem braków do listy.
        </p>
      ) : null}
      {modeError ? (
        <p className="text-sm text-red-600" role="alert">
          {modeError}
        </p>
      ) : null}
    </div>
  );
}
