"use client";

import { Calendar, MapPin, Package, Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { LOCATION_LABELS, UNIT_LABELS, readApiError } from "@/lib/errors";
import {
  convertToBaseQuantity,
  inputUnitsFor,
  minorFromZloty,
  zlotyFromMinor,
  type BaseUnit,
  type InputUnit,
} from "@/lib/quantity-input";

type LocationFilter = "" | keyof typeof LOCATION_LABELS;

const UNIT_OPTION_LABELS: Record<BaseUnit, string> = {
  gram: "gramy (g)",
  piece: "sztuki (szt)",
  milliliter: "mililitry (ml)",
};

export default function StockPage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const queryClient = useQueryClient();
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("");
  const [productName, setProductName] = useState("");
  const [productUnit, setProductUnit] = useState<BaseUnit>("gram");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [inputUnit, setInputUnit] = useState<InputUnit>("gram");
  const [location, setLocation] =
    useState<keyof typeof LOCATION_LABELS>("pantry");
  const [price, setPrice] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<{
    id: string;
    name: string;
    hasStock: boolean;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");

  const productsQuery = useQuery({
    queryKey: ["products", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error, response } = await client.GET(
        "/api/kitchens/{kitchenId}/products",
        { params: { path: { kitchenId } } },
      );
      if (response.status === 404) {
        throw new Error("Nie znaleziono kuchni albo nie masz do niej dostępu.");
      }
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać produktów."));
      }
      return data ?? [];
    },
  });

  const stockQuery = useQuery({
    queryKey: ["stock", kitchenId, locationFilter],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/stock-items",
        {
          params: {
            path: { kitchenId },
            query: locationFilter ? { location: locationFilter } : {},
          },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać zapasów."));
      }
      return data ?? [];
    },
  });

  const selectedProduct = useMemo(
    () =>
      productsQuery.data?.find((product) => product.id === selectedProductId),
    [productsQuery.data, selectedProductId],
  );

  const createProduct = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/products",
        {
          params: { path: { kitchenId } },
          body: { name: productName.trim(), defaultUnit: productUnit },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się dodać produktu."));
      }
      return data;
    },
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
      setProductName("");
      if (product) {
        setSelectedProductId(product.id);
        const units = inputUnitsFor(product.defaultUnit);
        setInputUnit(units[0]?.value ?? "gram");
      }
    },
  });

  const createStock = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) {
        throw new Error("Wybierz produkt.");
      }
      const converted = convertToBaseQuantity(
        quantity,
        inputUnit,
        selectedProduct.defaultUnit,
      );
      if (!converted.ok) {
        throw new Error(converted.message);
      }
      const purchasePriceMinor = minorFromZloty(price);
      if (purchasePriceMinor === null) {
        throw new Error("Podaj cenę w złotych, np. 5,99.");
      }
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/stock-items",
        {
          params: { path: { kitchenId } },
          body: {
            productId: selectedProduct.id,
            quantity: converted.quantity,
            location,
            purchasePriceMinor,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
            purchasedAt: purchasedAt
              ? new Date(purchasedAt).toISOString()
              : undefined,
          },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się dodać partii."));
      }
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stock", kitchenId] });
      setQuantity("");
      setPrice("");
      setFormError(null);
    },
    onError: (error) => {
      setFormError(readApiError(error));
    },
  });

  const updateStock = useMutation({
    mutationFn: async (stockItemId: string) => {
      const product = productsQuery.data?.find((item) => {
        const stock = stockQuery.data?.find((entry) => entry.id === stockItemId);
        return stock && item.id === stock.productId;
      });
      if (!product) {
        throw new Error("Nie znaleziono produktu partii.");
      }
      const converted = convertToBaseQuantity(
        editQuantity,
        product.defaultUnit,
        product.defaultUnit,
      );
      if (!converted.ok) {
        throw new Error(converted.message);
      }
      const client = createWebApiClient();
      const { error } = await client.PATCH(
        "/api/kitchens/{kitchenId}/stock-items/{stockItemId}",
        {
          params: { path: { kitchenId, stockItemId } },
          body: { quantity: converted.quantity },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się zaktualizować partii."),
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stock", kitchenId] });
      setEditingId(null);
    },
  });

  const deleteStock = useMutation({
    mutationFn: async (stockItemId: string) => {
      const client = createWebApiClient();
      const { error } = await client.DELETE(
        "/api/kitchens/{kitchenId}/stock-items/{stockItemId}",
        { params: { path: { kitchenId, stockItemId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się usunąć partii."));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stock", kitchenId] });
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (confirmCascade: boolean) => {
      if (!productToDelete) {
        throw new Error("Brak produktu do usunięcia.");
      }
      const client = createWebApiClient();
      const { error } = await client.DELETE(
        "/api/kitchens/{kitchenId}/products/{productId}",
        {
          params: {
            path: { kitchenId, productId: productToDelete.id },
            query: confirmCascade ? { confirmCascade: true } : {},
          },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się usunąć produktu."));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
      await queryClient.invalidateQueries({ queryKey: ["stock", kitchenId] });
      setProductToDelete(null);
    },
  });

  function onCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createProduct.mutate();
  }

  function onCreateStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    createStock.mutate();
  }

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-50 bg-gray-50/50 p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Plus size={20} className="text-emerald-600" /> Nowy produkt
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Dodaj do ogólnego katalogu (np. Mleko, Ryż).
            </p>
          </div>
          <div className="p-6">
            <form
              onSubmit={onCreateProduct}
              className="grid grid-cols-1 gap-6 md:grid-cols-2"
            >
              <div>
                <Label htmlFor="product-name">Nazwa produktu</Label>
                <Input
                  id="product-name"
                  placeholder="np. Mleko UHT 3.2%"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="product-unit">Jednostka bazowa</Label>
                <select
                  id="product-unit"
                  className="field-input"
                  value={productUnit}
                  onChange={(event) =>
                    setProductUnit(event.target.value as BaseUnit)
                  }
                >
                  {(Object.keys(UNIT_OPTION_LABELS) as BaseUnit[]).map(
                    (unit) => (
                      <option key={unit} value={unit}>
                        {UNIT_OPTION_LABELS[unit]}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div className="flex justify-end md:col-span-2">
                <Button type="submit" disabled={createProduct.isPending}>
                  {createProduct.isPending
                    ? "Dodawanie…"
                    : "Dodaj do katalogu"}
                </Button>
              </div>
            </form>
            {createProduct.error ? (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {readApiError(createProduct.error)}
              </p>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-50 bg-gray-50/50 p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Package size={20} className="text-emerald-600" /> Dodaj do
              spiżarni (Nowa partia)
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Włóż konkretny produkt z katalogu do swojej szafki lub lodówki.
            </p>
          </div>
          <div className="p-6">
            <form
              onSubmit={onCreateStock}
              className="grid grid-cols-1 gap-6 md:grid-cols-2"
            >
              <div className="md:col-span-2">
                <Label htmlFor="stock-product">
                  Wybierz produkt z katalogu
                </Label>
                <select
                  id="stock-product"
                  className="field-input"
                  value={selectedProductId}
                  required
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setSelectedProductId(nextId);
                    const product = productsQuery.data?.find(
                      (item) => item.id === nextId,
                    );
                    if (product) {
                      setInputUnit(
                        inputUnitsFor(product.defaultUnit)[0]?.value ?? "gram",
                      );
                    }
                  }}
                >
                  <option value="" disabled>
                    -- Wybierz produkt --
                  </option>
                  {(productsQuery.data ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({UNIT_LABELS[product.defaultUnit]})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="stock-qty">Ilość</Label>
                <Input
                  id="stock-qty"
                  inputMode="decimal"
                  placeholder="0"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="stock-unit">Jednostka wpisywana</Label>
                <select
                  id="stock-unit"
                  className="field-input"
                  value={inputUnit}
                  onChange={(event) =>
                    setInputUnit(event.target.value as InputUnit)
                  }
                >
                  {inputUnitsFor(selectedProduct?.defaultUnit ?? "gram").map(
                    (unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <Label
                  htmlFor="stock-location"
                  className="flex items-center gap-2"
                >
                  <MapPin size={16} className="text-gray-400" /> Miejsce
                </Label>
                <select
                  id="stock-location"
                  className="field-input"
                  value={location}
                  onChange={(event) =>
                    setLocation(
                      event.target.value as keyof typeof LOCATION_LABELS,
                    )
                  }
                >
                  {Object.entries(LOCATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="stock-price">
                  Cena zakupu za całość (zł)
                </Label>
                <Input
                  id="stock-price"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label
                  htmlFor="stock-expires"
                  className="flex items-center gap-2"
                >
                  <Calendar size={16} className="text-gray-400" /> Data ważności
                </Label>
                <Input
                  id="stock-expires"
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </div>
              <div>
                <Label
                  htmlFor="stock-purchased"
                  className="flex items-center gap-2"
                >
                  <Calendar size={16} className="text-gray-400" /> Data zakupu
                </Label>
                <Input
                  id="stock-purchased"
                  type="date"
                  value={purchasedAt}
                  onChange={(event) => setPurchasedAt(event.target.value)}
                />
              </div>
              <div className="flex justify-end md:col-span-2">
                <Button
                  type="submit"
                  variant="amber"
                  disabled={createStock.isPending}
                >
                  {createStock.isPending ? "Dodawanie…" : "Odłóż na półkę"}
                </Button>
              </div>
            </form>
            {formError || createStock.error ? (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {formError ?? readApiError(createStock.error)}
              </p>
            ) : null}
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <h2 className="text-xl font-bold text-gray-900">
              Twój stan magazynowy
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500">Miejsce:</span>
              <select
                className="block rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:ring-emerald-500"
                value={locationFilter}
                onChange={(event) =>
                  setLocationFilter(event.target.value as LocationFilter)
                }
                aria-label="Filtr miejsca"
              >
                <option value="">Wszystkie miejsca</option>
                {Object.entries(LOCATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {stockQuery.isPending || productsQuery.isPending ? (
              <div className="p-12 text-center text-sm text-gray-500">
                Ładowanie zapasów…
              </div>
            ) : null}
            {stockQuery.isError ? (
              <div className="p-12 text-center text-sm text-red-600" role="alert">
                {readApiError(stockQuery.error)}
              </div>
            ) : null}
            {!stockQuery.isPending &&
            !stockQuery.isError &&
            (stockQuery.data?.length ?? 0) === 0 ? (
              <div className="p-12 text-center">
                <Package size={48} className="mx-auto mb-4 text-gray-200" />
                <p className="text-gray-500">
                  Brak produktów w wybranym miejscu.
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  Dodaj nową partię powyżej, aby zacząć śledzić zapasy.
                </p>
              </div>
            ) : null}
            {(stockQuery.data?.length ?? 0) > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Produkt
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Pozostało / start
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Miejsce
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Cena partii
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Ważność
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Akcje
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stockQuery.data ?? []).map((item) => {
                      const product = productsQuery.data?.find(
                        (entry) => entry.id === item.productId,
                      );
                      return (
                        <tr
                          key={item.id}
                          className="border-b border-gray-50 last:border-0"
                        >
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {product?.name ?? item.productId}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {editingId === item.id ? (
                              <form
                                className="flex gap-2"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  updateStock.mutate(item.id);
                                }}
                              >
                                <Input
                                  aria-label="Nowa pozostała ilość"
                                  value={editQuantity}
                                  onChange={(event) =>
                                    setEditQuantity(event.target.value)
                                  }
                                />
                                <Button type="submit" size="sm">
                                  Zapisz
                                </Button>
                              </form>
                            ) : (
                              `${item.quantity} / ${item.initialQuantity} ${
                                product
                                  ? UNIT_LABELS[product.defaultUnit]
                                  : ""
                              }`
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {LOCATION_LABELS[item.location]}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {zlotyFromMinor(item.purchasePriceMinor)}{" "}
                            {item.currency}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {item.expiresAt
                              ? new Date(item.expiresAt).toLocaleDateString(
                                  "pl-PL",
                                )
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingId(item.id);
                                  setEditQuantity(item.quantity);
                                }}
                              >
                                Edytuj
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteStock.mutate(item.id)}
                              >
                                Usuń
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>

        <section className="opacity-90 transition-opacity hover:opacity-100">
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            Katalog produktów
          </h2>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {(productsQuery.data ?? []).length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                Katalog jest pusty.
              </div>
            ) : (
              <ul>
                {(productsQuery.data ?? []).map((product) => {
                  const hasStock = (stockQuery.data ?? []).some(
                    (item) => item.productId === product.id,
                  );
                  return (
                    <li
                      key={product.id}
                      className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="font-medium text-gray-900">
                        {product.name}{" "}
                        <span className="font-normal text-gray-500">
                          ({UNIT_LABELS[product.defaultUnit]})
                        </span>
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setProductToDelete({
                            id: product.id,
                            name: product.name,
                            hasStock,
                          })
                        }
                      >
                        Usuń produkt
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="mt-2 ml-2 text-xs text-gray-400">
            Usunięcie produktu z katalogu usunie również wszystkie jego partie
            na półkach.
          </p>
        </section>
      </div>

      {productToDelete ? (
        <ConfirmDialog
          title={`Usunąć produkt „${productToDelete.name}”?`}
          description={
            productToDelete.hasStock
              ? "Produkt ma partie zapasów. Potwierdzenie usunie produkt oraz wszystkie jego partie."
              : "Produkt nie ma partii i zostanie usunięty."
          }
          confirmLabel="Usuń"
          pending={deleteProduct.isPending}
          onCancel={() => setProductToDelete(null)}
          onConfirm={() => deleteProduct.mutate(productToDelete.hasStock)}
        />
      ) : null}
    </AppShell>
  );
}
