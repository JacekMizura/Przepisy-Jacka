"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { LOCATION_LABELS, readApiError, UNIT_LABELS } from "@/lib/errors";
import { formatQuantityWithUnit } from "@/lib/format-quantity";
import {
  convertToBaseQuantity,
  zlotyFromMinor,
  type BaseUnit,
  type InputUnit,
} from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

type Preview = components["schemas"]["ConsumeStockPreviewResultDto"];
type Summary = components["schemas"]["StockProductSummaryDto"];
type Batch = Summary["batches"][number];

type Mode = "auto" | "manual";

type StockConsumeDialogProps = {
  kitchenId: string;
  product: Summary;
  inputUnit: InputUnit;
  open: boolean;
  /** Gdy true, startuje w trybie ręcznym (np. odpis przeterminowanej partii). */
  preferManual?: boolean;
  initialBatchId?: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function StockConsumeDialog({
  kitchenId,
  product,
  inputUnit,
  open,
  preferManual = false,
  initialBatchId,
  onClose,
  onSuccess,
}: StockConsumeDialogProps) {
  const [quantity, setQuantity] = useState("");
  const [mode, setMode] = useState<Mode>(preferManual ? "manual" : "auto");
  const [manualQtyById, setManualQtyById] = useState<Record<string, string>>(
    () =>
      initialBatchId
        ? { [initialBatchId]: "" }
        : {},
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [staleError, setStaleError] = useState<string | null>(null);
  const [manualLinesForCommit, setManualLinesForCommit] = useState<
    Array<{ stockItemId: string; quantity: string }> | null
  >(null);

  const resetState = () => {
    setQuantity("");
    setMode(preferManual ? "manual" : "auto");
    setManualQtyById(initialBatchId ? { [initialBatchId]: "" } : {});
    setPreview(null);
    setStaleError(null);
    setManualLinesForCommit(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const clearPreview = () => {
    setPreview(null);
    setStaleError(null);
    setManualLinesForCommit(null);
  };

  const buildManualLines = (): Array<{ stockItemId: string; quantity: string }> => {
    const lines: Array<{ stockItemId: string; quantity: string }> = [];
    for (const batch of product.batches) {
      const raw = manualQtyById[batch.id]?.trim() ?? "";
      if (!raw) continue;
      const converted = convertToBaseQuantity(
        raw,
        inputUnit,
        product.defaultUnit as BaseUnit,
      );
      if (!converted.ok) {
        throw new Error(converted.message);
      }
      lines.push({
        stockItemId: batch.id,
        quantity: converted.quantity,
      });
    }
    if (lines.length === 0) {
      throw new Error("Wybierz co najmniej jedną partię i podaj ilość.");
    }
    return lines;
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
      const manualLines = mode === "manual" ? buildManualLines() : undefined;
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/consume/preview",
        {
          params: { path: { kitchenId, productId: product.productId } },
          body: {
            quantity: converted.quantity,
            ...(manualLines ? { manualLines } : {}),
          },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się przygotować podglądu."));
      }
      if (!data) {
        throw new Error("Brak podglądu zużycia.");
      }
      return { data, manualLines: manualLines ?? null };
    },
    onSuccess: ({ data, manualLines }) => {
      setPreview(data);
      setManualLinesForCommit(manualLines);
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
            ...(manualLinesForCommit
              ? { manualLines: manualLinesForCommit }
              : {}),
          },
        },
      );
      if (error) {
        const message = readApiError(error, "Nie udało się zatwierdzić zużycia.");
        if (message.includes("odśwież") || message.includes("zmienił")) {
          setStaleError(message);
          setPreview(null);
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

  const manualSumHint = useMemo(() => {
    if (mode !== "manual") return null;
    let sum = 0;
    let ok = true;
    for (const raw of Object.values(manualQtyById)) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const converted = convertToBaseQuantity(
        trimmed,
        inputUnit,
        product.defaultUnit as BaseUnit,
      );
      if (!converted.ok) {
        ok = false;
        break;
      }
      sum += Number(converted.quantity);
    }
    if (!ok) return "Niepoprawna ilość w jednej z partii.";
    if (!quantity.trim()) return null;
    const requested = convertToBaseQuantity(
      quantity,
      inputUnit,
      product.defaultUnit as BaseUnit,
    );
    if (!requested.ok) return null;
    const target = Number(requested.quantity);
    if (Math.abs(sum - target) > 0.0005) {
      return `Suma partii (${formatQuantityWithUnit(
        sum,
        product.defaultUnit,
      )}) ≠ żądane zużycie (${formatQuantityWithUnit(
        requested.quantity,
        product.defaultUnit,
      )}).`;
    }
    return null;
  }, [inputUnit, manualQtyById, mode, product.defaultUnit, quantity]);

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
                clearPreview();
              }}
              placeholder="np. 600"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-700">
              Podział na partie
            </legend>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "auto" ? "amber" : "outline"}
                onClick={() => {
                  setMode("auto");
                  clearPreview();
                }}
              >
                Automatycznie
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "manual" ? "amber" : "outline"}
                onClick={() => {
                  setMode("manual");
                  clearPreview();
                }}
              >
                Wybierz partie
              </Button>
            </div>
          </fieldset>

          {mode === "manual" ? (
            <ul className="space-y-2">
              {product.batches.map((batch) => (
                <ManualBatchRow
                  key={batch.id}
                  batch={batch}
                  unit={product.defaultUnit as BaseUnit}
                  value={manualQtyById[batch.id] ?? ""}
                  onChange={(value) => {
                    setManualQtyById((prev) => ({
                      ...prev,
                      [batch.id]: value,
                    }));
                    clearPreview();
                  }}
                />
              ))}
            </ul>
          ) : null}

          {manualSumHint ? (
            <p className="text-sm text-amber-800" role="status">
              {manualSumHint}
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            disabled={
              !quantity.trim() ||
              previewMutation.isPending ||
              Boolean(manualSumHint)
            }
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
                          {line.isExpired ? " · przeterminowane" : ""}
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
              {staleError} Odśwież podgląd przed zatwierdzeniem.
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

function ManualBatchRow({
  batch,
  unit,
  value,
  onChange,
}: {
  batch: Batch;
  unit: BaseUnit;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <li
      className={cn(
        "rounded-xl border p-3 text-sm",
        batch.isExpired
          ? "border-red-100 bg-red-50/50"
          : "border-gray-100 bg-gray-50/70",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-gray-900">
            {batch.storeName ?? "Ręczne dodanie"}
            {batch.isExpired ? (
              <span className="ml-2 text-xs font-semibold text-red-700">
                Przeterminowane
              </span>
            ) : null}
          </p>
          <p className="text-xs text-gray-500">
            Pozostało{" "}
            {formatQuantityWithUnit(batch.quantity, unit)} ·{" "}
            {LOCATION_LABELS[batch.location]}
          </p>
          <p className="text-xs text-gray-500">
            {batch.purchasedAt
              ? `Przyjęto ${new Date(batch.purchasedAt).toLocaleDateString("pl-PL")}`
              : "Bez daty przyjęcia"}
            {batch.expiresAt
              ? ` · ważne do ${new Date(batch.expiresAt).toLocaleDateString("pl-PL")}`
              : ""}
          </p>
          <p className="text-xs text-gray-500">
            {batch.unitPriceMinor != null
              ? `${zlotyFromMinor(batch.unitPriceMinor)} ${batch.currency}/${UNIT_LABELS[unit]}`
              : batch.purchasePriceMinor != null
                ? `${zlotyFromMinor(batch.purchasePriceMinor)} ${batch.currency} za partię`
                : "Cena nieznana"}
          </p>
        </div>
        <div className="w-full sm:w-28">
          <Label htmlFor={`manual-${batch.id}`} className="sr-only">
            Ilość z partii
          </Label>
          <Input
            id={`manual-${batch.id}`}
            inputMode="decimal"
            placeholder="0"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`Ilość z partii ${batch.storeName ?? batch.id}`}
          />
        </div>
      </div>
    </li>
  );
}
