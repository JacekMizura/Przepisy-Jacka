"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { formatQuantityWithUnit } from "@/lib/format-quantity";
import {
  convertToBaseQuantity,
  zlotyFromMinor,
  type BaseUnit,
  type InputUnit,
} from "@/lib/quantity-input";

type Preview = components["schemas"]["ConsumeStockPreviewResultDto"];
type Summary = components["schemas"]["StockProductSummaryDto"];

type StockConsumeDialogProps = {
  kitchenId: string;
  product: Summary;
  inputUnit: InputUnit;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function StockConsumeDialog({
  kitchenId,
  product,
  inputUnit,
  open,
  onClose,
  onSuccess,
}: StockConsumeDialogProps) {
  const [quantity, setQuantity] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [staleError, setStaleError] = useState<string | null>(null);

  const handleClose = () => {
    setQuantity("");
    setPreview(null);
    setStaleError(null);
    onClose();
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      const converted = convertToBaseQuantity(
        quantity,
        inputUnit,
        product.defaultUnit as BaseUnit,
      );
      if (!converted.ok) {
        throw new Error(converted.message);
      }
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/consume/preview",
        {
          params: { path: { kitchenId, productId: product.productId } },
          body: { quantity: converted.quantity },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się przygotować podglądu."));
      }
      if (!data) {
        throw new Error("Brak podglądu zużycia.");
      }
      return data;
    },
    onSuccess: (data) => {
      setPreview(data);
      setStaleError(null);
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!preview) {
        throw new Error("Brak podglądu do zatwierdzenia.");
      }
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/consume",
        {
          params: { path: { kitchenId, productId: product.productId } },
          body: {
            quantity: preview.quantity,
            idempotencyKey: crypto.randomUUID(),
            previewFingerprint: preview.previewFingerprint,
          },
        },
      );
      if (error) {
        const message = readApiError(error, "Nie udało się zatwierdzić zużycia.");
        if (message.includes("odśwież") || message.includes("zmienił")) {
          setStaleError(message);
        }
        throw new Error(message);
      }
      return data;
    },
    onSuccess: () => {
      onSuccess();
      handleClose();
    },
  });

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consume-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="consume-title" className="text-lg font-semibold text-gray-900">
          Zużyj: {product.productName}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Dostępne łącznie:{" "}
          {formatQuantityWithUnit(product.totalQuantity, product.defaultUnit)} (
          {product.batchCount}{" "}
          {product.batchCount === 1 ? "partia" : "partie"})
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="consume-qty">Ilość do zużycia</Label>
            <Input
              id="consume-qty"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                setPreview(null);
                setStaleError(null);
              }}
              placeholder="np. 600"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={!quantity.trim() || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending ? "Liczenie…" : "Podgląd podziału"}
          </Button>

          {previewMutation.isError ? (
            <p className="text-sm text-red-600" role="alert">
              {readApiError(previewMutation.error)}
            </p>
          ) : null}

          {preview ? (
            <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/80 p-3 text-sm">
              {preview.insufficientQuantity ? (
                <p className="text-amber-800" role="alert">
                  Niewystarczający stan — brakuje{" "}
                  {formatQuantityWithUnit(
                    preview.insufficientQuantity,
                    product.defaultUnit,
                  )}
                  .
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-500">{preview.disclaimer}</p>
                  <ul className="space-y-2">
                    {preview.lines.map((line) => (
                      <li
                        key={line.stockItemId}
                        className="rounded-lg border border-white bg-white p-2"
                      >
                        <p className="font-medium text-gray-900">
                          {formatQuantityWithUnit(
                            line.quantity,
                            product.defaultUnit,
                          )}
                          {line.storeName ? ` · ${line.storeName}` : ""}
                        </p>
                        <p className="text-xs text-gray-500">
                          {line.costMinor != null
                            ? `Koszt: ${zlotyFromMinor(line.costMinor)} zł`
                            : "Koszt: nieznany"}
                          {line.expiresAt
                            ? ` · ważne do ${new Date(line.expiresAt).toLocaleDateString("pl-PL")}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="font-medium text-gray-900">
                    Łączny koszt:{" "}
                    {preview.costComplete && preview.totalCostMinor != null
                      ? `${zlotyFromMinor(preview.totalCostMinor)} zł`
                      : "niekompletny (brak ceny w części partii)"}
                  </p>
                </>
              )}
            </div>
          ) : null}

          {staleError ? (
            <p className="text-sm text-amber-800" role="alert">
              {staleError}
            </p>
          ) : null}

          {commitMutation.isError && !staleError ? (
            <p className="text-sm text-red-600" role="alert">
              {readApiError(commitMutation.error)}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Anuluj
          </Button>
          <Button
            type="button"
            variant="amber"
            disabled={
              !preview ||
              Boolean(preview.insufficientQuantity) ||
              commitMutation.isPending
            }
            onClick={() => commitMutation.mutate()}
          >
            {commitMutation.isPending ? "Zapisuję…" : "Zatwierdź zużycie"}
          </Button>
        </div>
      </div>
    </div>
  );
}
