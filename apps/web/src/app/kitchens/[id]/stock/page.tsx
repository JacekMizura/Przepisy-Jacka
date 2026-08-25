"use client";

import { Calendar, MapPin, Package, Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { type FormEvent, Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageField } from "@/components/image-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { LOCATION_LABELS, UNIT_LABELS, readApiError } from "@/lib/errors";
import { PRODUCT_CATEGORY_OPTIONS, validateOptionalEan } from "@/lib/product-media";
import {
  convertToBaseQuantity,
  inputUnitsFor,
  minorFromZloty,
  zlotyFromMinor,
  type BaseUnit,
  type InputUnit,
} from "@/lib/quantity-input";

type LocationFilter = "" | keyof typeof LOCATION_LABELS;
type UnitFilter = "" | BaseUnit;

const UNIT_OPTION_LABELS: Record<BaseUnit, string> = {
  gram: "gramy (g)",
  piece: "sztuki (szt)",
  milliliter: "mililitry (ml)",
};

const UNCATEGORIZED = "Bez kategorii";

export default function StockPage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const queryClient = useQueryClient();
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState<UnitFilter>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [productName, setProductName] = useState("");
  const [productUnit, setProductUnit] = useState<BaseUnit>("gram");
  const [productEan, setProductEan] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [inputUnit, setInputUnit] = useState<InputUnit>("gram");
  const [location, setLocation] =
    useState<keyof typeof LOCATION_LABELS>("pantry");
  const [price, setPrice] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [stockEan, setStockEan] = useState("");
  const [stockImageUrl, setStockImageUrl] = useState("");
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

  const categoryOptions = useMemo(() => {
    const fromCatalog = new Set<string>(PRODUCT_CATEGORY_OPTIONS);
    for (const product of productsQuery.data ?? []) {
      if (product.category) {
        fromCatalog.add(product.category);
      }
    }
    return Array.from(fromCatalog).sort((a, b) => a.localeCompare(b, "pl"));
  }, [productsQuery.data]);

  const filteredStock = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return (stockQuery.data ?? []).filter((item) => {
      const product = productsQuery.data?.find(
        (entry) => entry.id === item.productId,
      );
      if (!product) {
        return false;
      }
      if (categoryFilter) {
        const category = product.category?.trim() || UNCATEGORIZED;
        if (category !== categoryFilter) {
          return false;
        }
      }
      if (unitFilter && product.defaultUnit !== unitFilter) {
        return false;
      }
      if (needle) {
        const haystack = [
          product.name,
          product.category ?? "",
          product.ean ?? "",
          item.ean ?? "",
          UNIT_LABELS[product.defaultUnit],
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [
    categoryFilter,
    productsQuery.data,
    searchQuery,
    stockQuery.data,
    unitFilter,
  ]);

  const stockByCategory = useMemo(() => {
    const groups = new Map<string, typeof filteredStock>();
    for (const item of filteredStock) {
      const product = productsQuery.data?.find(
        (entry) => entry.id === item.productId,
      );
      const key = product?.category?.trim() || UNCATEGORIZED;
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === UNCATEGORIZED) {
        return 1;
      }
      if (b === UNCATEGORIZED) {
        return -1;
      }
      return a.localeCompare(b, "pl");
    });
  }, [filteredStock, productsQuery.data]);

  const createProduct = useMutation({
    mutationFn: async () => {
      const eanError = validateOptionalEan(productEan);
      if (eanError) {
        throw new Error(eanError);
      }
      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/products",
        {
          params: { path: { kitchenId } },
          body: {
            name: productName.trim(),
            defaultUnit: productUnit,
            ean: productEan.trim() || null,
            imageUrl: productImageUrl.trim() || null,
            category: productCategory.trim() || null,
          },
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
      setProductEan("");
      setProductImageUrl("");
      setProductCategory("");
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
      const eanError = validateOptionalEan(stockEan);
      if (eanError) {
        throw new Error(eanError);
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
            ean: stockEan.trim() || null,
            imageUrl: stockImageUrl.trim() || null,
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
      await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
      setQuantity("");
      setPrice("");
      setStockEan("");
      setStockImageUrl("");
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
              <div>
                <Label htmlFor="product-category">Kategoria</Label>
                <select
                  id="product-category"
                  className="field-input"
                  value={productCategory}
                  onChange={(event) => setProductCategory(event.target.value)}
                >
                  <option value="">Bez kategorii</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="product-ean">EAN (opcjonalnie)</Label>
                <Input
                  id="product-ean"
                  inputMode="numeric"
                  placeholder="np. 5901234123457"
                  value={productEan}
                  onChange={(event) => setProductEan(event.target.value)}
                  aria-describedby="product-ean-hint"
                />
                <p id="product-ean-hint" className="mt-1 text-xs text-gray-500">
                  8, 12, 13 albo 14 cyfr. Puste pole = bez kodu.
                </p>
              </div>
              <div className="md:col-span-2">
                <ImageField
                  id="product-image"
                  value={productImageUrl}
                  onChange={setProductImageUrl}
                />
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
                      setStockEan(product.ean ?? "");
                      setStockImageUrl(product.imageUrl ?? "");
                    }
                  }}
                >
                  <option value="" disabled>
                    -- Wybierz produkt --
                  </option>
                  {(productsQuery.data ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({UNIT_LABELS[product.defaultUnit]}
                      {product.category ? ` · ${product.category}` : ""})
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
              <div>
                <Label htmlFor="stock-ean">EAN (opcjonalnie)</Label>
                <Input
                  id="stock-ean"
                  inputMode="numeric"
                  placeholder="np. 5901234123457"
                  value={stockEan}
                  onChange={(event) => setStockEan(event.target.value)}
                  aria-describedby="stock-ean-hint"
                />
                <p id="stock-ean-hint" className="mt-1 text-xs text-gray-500">
                  8, 12, 13 albo 14 cyfr. Puste = bez kodu.
                </p>
              </div>
              <div className="md:col-span-2">
                <ImageField
                  id="stock-image"
                  value={stockImageUrl}
                  onChange={setStockImageUrl}
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
          <div className="mb-4 flex flex-col gap-4">
            <h2 className="text-xl font-bold text-gray-900">
              Twój stan magazynowy
            </h2>
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
              <Input
                aria-label="Szukaj w zapasach"
                placeholder="Szukaj: nazwa, EAN, kategoria…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="lg:max-w-xs"
              />
              <label className="flex items-center gap-2 text-sm text-gray-500">
                <span className="font-medium whitespace-nowrap">Kategoria:</span>
                <select
                  className="rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-900 shadow-sm"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="">Wszystkie</option>
                  <option value={UNCATEGORIZED}>{UNCATEGORIZED}</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-500">
                <span className="font-medium whitespace-nowrap">Jednostka:</span>
                <select
                  className="rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-900 shadow-sm"
                  value={unitFilter}
                  onChange={(event) =>
                    setUnitFilter(event.target.value as UnitFilter)
                  }
                >
                  <option value="">Wszystkie</option>
                  {(Object.keys(UNIT_OPTION_LABELS) as BaseUnit[]).map(
                    (unit) => (
                      <option key={unit} value={unit}>
                        {UNIT_OPTION_LABELS[unit]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-500">
                <span className="font-medium whitespace-nowrap">Miejsce:</span>
                <select
                  className="rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-900 shadow-sm"
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
              </label>
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
            filteredStock.length === 0 ? (
              <div className="p-12 text-center">
                <Package size={48} className="mx-auto mb-4 text-gray-200" />
                <p className="text-gray-500">
                  Brak produktów dla wybranych filtrów.
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  Dodaj nową partię powyżej albo zmień wyszukiwanie.
                </p>
              </div>
            ) : null}
            {filteredStock.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Zdjęcie
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Produkt
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-700">
                        Jednostka
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
                    {stockByCategory.map(([category, items]) => (
                      <Fragment key={category}>
                        <tr className="bg-emerald-50/40">
                          <td
                            colSpan={8}
                            className="px-4 py-2 text-xs font-semibold tracking-wide text-emerald-800 uppercase"
                          >
                            {category}
                          </td>
                        </tr>
                        {items.map((item) => {
                          const product = productsQuery.data?.find(
                            (entry) => entry.id === item.productId,
                          );
                          const photo =
                            item.imageUrl || product?.imageUrl || null;
                          return (
                            <tr
                              key={item.id}
                              className="border-b border-gray-50 last:border-0"
                            >
                              <td className="px-4 py-3">
                                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                                  {photo ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={photo}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <Package
                                      size={18}
                                      className="text-gray-300"
                                    />
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">
                                  {product?.name ?? item.productId}
                                </p>
                                {(item.ean || product?.ean) && (
                                  <p className="text-xs text-gray-400">
                                    EAN {item.ean || product?.ean}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {product
                                  ? UNIT_LABELS[product.defaultUnit]
                                  : "—"}
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
                                  `${item.quantity} / ${item.initialQuantity}`
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
                      </Fragment>
                    ))}
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
                      className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                          {product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Package size={18} className="text-gray-300" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">
                            {product.name}{" "}
                            <span className="font-normal text-gray-500">
                              ({UNIT_LABELS[product.defaultUnit]})
                            </span>
                          </p>
                          <p className="truncate text-xs text-gray-400">
                            {product.category ?? UNCATEGORIZED}
                            {product.ean ? ` · EAN ${product.ean}` : ""}
                          </p>
                        </div>
                      </div>
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
