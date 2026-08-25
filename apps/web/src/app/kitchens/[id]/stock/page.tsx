"use client";

import { useParams } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  const [location, setLocation] = useState<keyof typeof LOCATION_LABELS>("pantry");
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
    () => productsQuery.data?.find((product) => product.id === selectedProductId),
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
  });

  const updateStock = useMutation({
    mutationFn: async (stockItemId: string) => {
      if (!selectedProduct && !editingId) {
        throw new Error("Brak partii do edycji.");
      }
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
        throw new Error(readApiError(error, "Nie udało się zaktualizować partii."));
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Zapasy</h1>
          <p className="text-sm text-muted-foreground">
            Ilości wysyłane do API są w jednostkach bazowych: sztuki, gramy albo
            mililitry. Kilogramy i litry są przeliczane w przeglądarce.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Nowy produkt</CardTitle>
            <CardDescription>
              Nazwy „Mleko” i „ mleko ” to ten sam produkt.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreateProduct} className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="product-name">Nazwa</Label>
                <Input
                  id="product-name"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-unit">Jednostka bazowa</Label>
                <select
                  id="product-unit"
                  className="h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
                  value={productUnit}
                  onChange={(event) =>
                    setProductUnit(event.target.value as BaseUnit)
                  }
                >
                  <option value="piece">sztuki (jajka)</option>
                  <option value="gram">gramy (kuskus)</option>
                  <option value="milliliter">mililitry (mleko)</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" disabled={createProduct.isPending}>
                  {createProduct.isPending ? "Dodawanie…" : "Dodaj produkt"}
                </Button>
              </div>
            </form>
            {createProduct.error ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {readApiError(createProduct.error)}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nowa partia</CardTitle>
            <CardDescription>
              Cena to łączna kwota zapłacona za początkową ilość partii.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreateStock} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="stock-product">Produkt</Label>
                <select
                  id="stock-product"
                  className="h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
                  value={selectedProductId}
                  required
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setSelectedProductId(nextId);
                    const product = productsQuery.data?.find(
                      (item) => item.id === nextId,
                    );
                    if (product) {
                      setInputUnit(inputUnitsFor(product.defaultUnit)[0]?.value ?? "gram");
                    }
                  }}
                >
                  <option value="">Wybierz produkt</option>
                  {(productsQuery.data ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({UNIT_LABELS[product.defaultUnit]})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-qty">Ilość</Label>
                <Input
                  id="stock-qty"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-unit">Jednostka wpisywana</Label>
                <select
                  id="stock-unit"
                  className="h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
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
              <div className="space-y-2">
                <Label htmlFor="stock-location">Miejsce</Label>
                <select
                  id="stock-location"
                  className="h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
                  value={location}
                  onChange={(event) =>
                    setLocation(event.target.value as keyof typeof LOCATION_LABELS)
                  }
                >
                  {Object.entries(LOCATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-price">Cena zakupu całej partii (zł)</Label>
                <Input
                  id="stock-price"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-expires">Data ważności</Label>
                <Input
                  id="stock-expires"
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-purchased">Data zakupu</Label>
                <Input
                  id="stock-purchased"
                  type="date"
                  value={purchasedAt}
                  onChange={(event) => setPurchasedAt(event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={createStock.isPending}>
                  {createStock.isPending ? "Dodawanie…" : "Dodaj partię"}
                </Button>
              </div>
            </form>
            {formError || createStock.error ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {formError ?? readApiError(createStock.error)}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Lista zapasów</h2>
          <label className="flex items-center gap-2 text-sm">
            <span>Filtr miejsca</span>
            <select
              className="h-10 rounded-md border border-border bg-card px-2 text-sm"
              value={locationFilter}
              onChange={(event) =>
                setLocationFilter(event.target.value as LocationFilter)
              }
            >
              <option value="">Wszystkie</option>
              {Object.entries(LOCATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {stockQuery.isPending || productsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Ładowanie zapasów…</p>
        ) : null}
        {stockQuery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {readApiError(stockQuery.error)}
          </p>
        ) : null}
        {stockQuery.data?.length === 0 ? (
          <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            Brak partii w wybranym miejscu.
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-secondary/50">
              <tr>
                <th className="px-3 py-2 font-medium">Produkt</th>
                <th className="px-3 py-2 font-medium">Pozostało / start</th>
                <th className="px-3 py-2 font-medium">Miejsce</th>
                <th className="px-3 py-2 font-medium">Cena partii</th>
                <th className="px-3 py-2 font-medium">Ważność</th>
                <th className="px-3 py-2 font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {(stockQuery.data ?? []).map((item) => {
                const product = productsQuery.data?.find(
                  (entry) => entry.id === item.productId,
                );
                return (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{product?.name ?? item.productId}</td>
                    <td className="px-3 py-2">
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
                            onChange={(event) => setEditQuantity(event.target.value)}
                          />
                          <Button type="submit" size="sm">
                            Zapisz
                          </Button>
                        </form>
                      ) : (
                        `${item.quantity} / ${item.initialQuantity} ${product ? UNIT_LABELS[product.defaultUnit] : ""}`
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {LOCATION_LABELS[item.location]}
                    </td>
                    <td className="px-3 py-2">
                      {zlotyFromMinor(item.purchasePriceMinor)} {item.currency}
                    </td>
                    <td className="px-3 py-2">
                      {item.expiresAt
                        ? new Date(item.expiresAt).toLocaleDateString("pl-PL")
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditQuantity(item.quantity);
                          }}
                        >
                          Edytuj ilość
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteStock.mutate(item.id)}
                        >
                          Usuń partię
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Katalog</CardTitle>
            <CardDescription>
              Usunięcie produktu z partiami wymaga potwierdzenia. Partie są wtedy
              usuwane kaskadowo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(productsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak produktów.</p>
            ) : null}
            {(productsQuery.data ?? []).map((product) => {
              const hasStock = (stockQuery.data ?? []).some(
                (item) => item.productId === product.id,
              );
              return (
                <div
                  key={product.id}
                  className="flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p>
                    {product.name}{" "}
                    <span className="text-muted-foreground">
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
                </div>
              );
            })}
          </CardContent>
        </Card>
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
