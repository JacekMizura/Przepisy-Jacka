"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useId, useMemo, useState } from "react";

import { PendingImageField } from "@/components/media-image-field";
import { ProductThumb } from "@/components/product-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { LOCATION_LABELS, readApiError, UNIT_LABELS } from "@/lib/errors";
import { formatQuantityNumber } from "@/lib/format-quantity";
import { productImageUrls } from "@/lib/product-image";
import { INPUT_UNIT_LABELS } from "@/lib/shopping-labels";
import {
  inputUnitsFor,
  minorFromZloty,
  type BaseUnit,
  type InputUnit,
} from "@/lib/quantity-input";

type ShoppingListItem = components["schemas"]["ShoppingListItemDto"];
type Product = components["schemas"]["ProductDto"];

type LineDraft = {
  shoppingListItemId: string;
  label: string;
  quantity: string;
  inputUnit: InputUnit;
  location: keyof typeof LOCATION_LABELS;
  priceZloty: string;
  expiresAt: string;
  hasProduct: boolean;
  productId: string;
  createNew: boolean;
  newProductName: string;
  newProductUnit: BaseUnit;
};

type CheckoutPurchaseDialogProps = {
  kitchenId: string;
  items: ShoppingListItem[];
  products: Product[];
  pending?: boolean;
  onConfirm: (payload: {
    idempotencyKey: string;
    storeName?: string;
    purchasedAt?: string;
    lines: components["schemas"]["CheckoutPurchaseLineDto"][];
    receiptFile: File | null;
  }) => void;
  onCancel: () => void;
};

function defaultInputUnit(
  item: ShoppingListItem,
  productUnit?: BaseUnit,
): InputUnit {
  if (item.plannedUnit) {
    return item.plannedUnit as InputUnit;
  }
  if (productUnit) {
    return inputUnitsFor(productUnit)[0]?.value ?? "piece";
  }
  return "piece";
}

function buildLineDraft(item: ShoppingListItem, products: Product[]): LineDraft {
  const product = item.productId
    ? products.find((entry) => entry.id === item.productId)
    : null;
  const label =
    product?.name ?? item.customName ?? item.product?.name ?? "Pozycja";
  return {
    shoppingListItemId: item.id,
    label,
    quantity: formatQuantityNumber(item.plannedQuantity ?? "1"),
    inputUnit: defaultInputUnit(item, product?.defaultUnit as BaseUnit | undefined),
    location: "pantry",
    priceZloty: "",
    expiresAt: "",
    hasProduct: Boolean(item.productId),
    productId: item.productId ?? "",
    createNew: !item.productId,
    newProductName: item.customName ?? label,
    newProductUnit: (product?.defaultUnit as BaseUnit | undefined) ?? "piece",
  };
}

export function CheckoutPurchaseDialog({
  kitchenId,
  items,
  products,
  pending,
  onConfirm,
  onCancel,
}: CheckoutPurchaseDialogProps) {
  const titleId = useId();
  const [storeName, setStoreName] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [lines, setLines] = useState<LineDraft[]>(() =>
    items.map((item) => buildLineDraft(item, products)),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const idempotencyKey = useMemo(
    () => `checkout-${kitchenId}-${crypto.randomUUID()}`,
    [kitchenId],
  );

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function handleSubmit() {
    setFormError(null);
    const payloadLines: components["schemas"]["CheckoutPurchaseLineDto"][] = [];

    for (const line of lines) {
      const priceMinor = minorFromZloty(line.priceZloty);
      if (priceMinor === null) {
        setFormError(`Podaj poprawną cenę dla „${line.label}”.`);
        return;
      }

      const entry: components["schemas"]["CheckoutPurchaseLineDto"] = {
        shoppingListItemId: line.shoppingListItemId,
        quantity: line.quantity.trim(),
        inputUnit: line.inputUnit,
        location: line.location,
        priceMinor,
        expiresAt: line.expiresAt
          ? new Date(`${line.expiresAt}T12:00:00`).toISOString()
          : undefined,
      };

      if (line.hasProduct) {
        if (!line.productId) {
          setFormError(`Wybierz produkt dla „${line.label}”.`);
          return;
        }
        entry.productId = line.productId;
      } else if (line.createNew) {
        if (!line.newProductName.trim()) {
          setFormError(`Podaj nazwę nowego produktu dla „${line.label}”.`);
          return;
        }
        entry.createProduct = {
          name: line.newProductName.trim(),
          defaultUnit: line.newProductUnit,
        };
      } else {
        if (!line.productId) {
          setFormError(`Wybierz istniejący produkt dla „${line.label}”.`);
          return;
        }
        entry.productId = line.productId;
      }

      payloadLines.push(entry);
    }

    const purchasedAtIso = purchasedAt
      ? new Date(`${purchasedAt}T12:00:00`).toISOString()
      : undefined;

    onConfirm({
      idempotencyKey,
      storeName: storeName.trim() || undefined,
      purchasedAt: purchasedAtIso,
      lines: payloadLines,
      receiptFile,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={pending ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            Podsumuj zakupy
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Uzupełnij dane zakupionych pozycji. Po zatwierdzeniu trafią do
            zapasów i historii zakupów.
          </p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="checkout-store">Sklep (opcjonalnie)</Label>
              <Input
                id="checkout-store"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                placeholder="np. Biedronka"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkout-date">Data zakupu</Label>
              <Input
                id="checkout-date"
                type="date"
                value={purchasedAt}
                onChange={(event) => setPurchasedAt(event.target.value)}
              />
            </div>
          </div>

          <PendingImageField
            file={receiptFile}
            onFileSelected={setReceiptFile}
            label="Zdjęcie paragonu (opcjonalnie)"
            size="wide"
            note="Wyślemy razem z rozliczeniem zakupów."
          />

          {lines.map((line, index) => {
            const product = line.productId
              ? products.find((entry) => entry.id === line.productId)
              : null;
            const thumb = productImageUrls(
              product ??
                items.find((item) => item.id === line.shoppingListItemId)
                  ?.product,
            ).thumbnail;
            return (
            <div
              key={line.shoppingListItemId}
              className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4"
            >
              <div className="flex items-center gap-3">
                <ProductThumb src={thumb} alt={line.label} size="sm" />
                <p className="font-medium text-gray-900">{line.label}</p>
              </div>

              {!line.hasProduct ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-gray-600">
                    Pozycja tekstowa — powiąż z produktem w katalogu:
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={line.createNew}
                        onChange={() =>
                          updateLine(index, { createNew: true, productId: "" })
                        }
                      />
                      Utwórz nowy produkt
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={!line.createNew}
                        onChange={() => updateLine(index, { createNew: false })}
                      />
                      Wybierz istniejący
                    </label>
                  </div>
                  {line.createNew ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Nazwa produktu</Label>
                        <Input
                          value={line.newProductName}
                          onChange={(event) =>
                            updateLine(index, {
                              newProductName: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Jednostka bazowa</Label>
                        <select
                          className="block w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm"
                          value={line.newProductUnit}
                          onChange={(event) =>
                            updateLine(index, {
                              newProductUnit: event.target.value as BaseUnit,
                            })
                          }
                        >
                          {(Object.keys(UNIT_LABELS) as BaseUnit[]).map(
                            (unit) => (
                              <option key={unit} value={unit}>
                                {UNIT_LABELS[unit]}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Produkt z katalogu</Label>
                      <select
                        className="block w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm"
                        value={line.productId}
                        onChange={(event) =>
                          updateLine(index, { productId: event.target.value })
                        }
                      >
                        <option value="">Wybierz produkt…</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({UNIT_LABELS[product.defaultUnit]})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Ilość</Label>
                  <Input
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(index, { quantity: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Jednostka</Label>
                  <select
                    className="block w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm"
                    value={line.inputUnit}
                    onChange={(event) =>
                      updateLine(index, {
                        inputUnit: event.target.value as InputUnit,
                      })
                    }
                  >
                    {(
                      Object.keys(INPUT_UNIT_LABELS) as ShoppingListItem["plannedUnit"][]
                    ).map((unit) =>
                      unit ? (
                        <option key={unit} value={unit}>
                          {INPUT_UNIT_LABELS[unit]}
                        </option>
                      ) : null,
                    )}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Miejsce</Label>
                  <select
                    className="block w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm"
                    value={line.location}
                    onChange={(event) =>
                      updateLine(index, {
                        location: event.target
                          .value as keyof typeof LOCATION_LABELS,
                      })
                    }
                  >
                    {(Object.keys(LOCATION_LABELS) as Array<
                      keyof typeof LOCATION_LABELS
                    >).map((location) => (
                      <option key={location} value={location}>
                        {LOCATION_LABELS[location]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Cena (zł)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={line.priceZloty}
                    onChange={(event) =>
                      updateLine(index, { priceZloty: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Data ważności (opcjonalnie)</Label>
                  <Input
                    type="date"
                    value={line.expiresAt}
                    onChange={(event) =>
                      updateLine(index, { expiresAt: event.target.value })
                    }
                  />
                </div>
              </div>
            </div>
            );
          })}

          {formError ? (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Anuluj
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Zapisywanie…" : "Zatwierdź zakupy"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export async function checkoutPurchase(
  kitchenId: string,
  body: components["schemas"]["CheckoutPurchaseDto"],
) {
  const client = createWebApiClient();
  const { data, error } = await client.POST(
    "/api/kitchens/{kitchenId}/purchases/checkout",
    {
      params: { path: { kitchenId } },
      body,
    },
  );
  if (error) {
    throw new Error(readApiError(error, "Nie udało się rozliczyć zakupów."));
  }
  return data;
}
