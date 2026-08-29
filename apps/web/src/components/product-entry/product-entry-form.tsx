"use client";

import type { components } from "@moja-kuchnia/api-client";
import { Calendar, MapPin, Package } from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MediaImageField } from "@/components/media-image-field";
import {
  buildUpsertProductNutritionDto,
  createEmptyNutritionDraft,
  draftHasNutritionValues,
  initialNutritionDraft,
  ProductNutritionEditor,
  type NutritionFormDraft,
} from "@/components/product-entry/product-nutrition-editor";
import { ProductPhotoField } from "@/components/product-photo-field";
import { ProductPurchaseOptions } from "@/components/product-purchase-options";
import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { LOCATION_LABELS, UNIT_LABELS, readApiError } from "@/lib/errors";
import {
  formatQuantityWithUnit,
  formatMoneyMinor,
} from "@/lib/format-quantity";
import { deleteKitchenMedia } from "@/lib/media-upload";
import {
  PRODUCT_CATEGORY_OPTIONS,
  validateOptionalEan,
} from "@/lib/product-media";
import {
  convertToBaseQuantity,
  inputUnitsFor,
  minorFromZloty,
  type BaseUnit,
  type InputUnit,
} from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

type Product = components["schemas"]["ProductDto"];
type ProductMatch = components["schemas"]["ProductMatchResultDto"];
type CreateProductIntake =
  components["schemas"]["CreateProductIntakeDto"];
type StockSummary = components["schemas"]["StockProductSummaryDto"];
type UpdateProduct = components["schemas"]["UpdateProductDto"];

export type ProductEntryMode = "create" | "edit" | "add-batch";

export type ProductEntrySuccess = {
  product: Product;
  putInStock: boolean;
  mode: ProductEntryMode;
  message: string;
};

type ProductEntryFormProps = {
  kitchenId: string;
  mode: ProductEntryMode;
  productId?: string;
  initialProduct?: Product | null;
  defaultPutInStock?: boolean;
  initialName?: string;
  initialQuantity?: string;
  onSuccess: (result: ProductEntrySuccess) => void;
};

const UNIT_OPTION_LABELS: Record<BaseUnit, string> = {
  gram: "gramy (g)",
  piece: "sztuki (szt)",
  milliliter: "mililitry (ml)",
};

function todayDateInput(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function matchMessage(match: ProductMatch | undefined): string | null {
  if (!match) {
    return null;
  }
  const rawMessage = match.message as unknown;
  if (typeof rawMessage === "string" && rawMessage.trim()) {
    return rawMessage;
  }
  if (match.exactEan || match.exactName) {
    return "Ten produkt jest już w katalogu. Możesz odłożyć nową kupioną ilość do zapasów.";
  }
  if (match.archivedMatch) {
    return "Znaleziono zarchiwizowany produkt o tym samym EAN lub nazwie. Przywróć go zamiast tworzyć nowy.";
  }
  return null;
}

function matchedProduct(match: ProductMatch | undefined): Product | null {
  if (!match) {
    return null;
  }
  return match.exactEan ?? match.exactName ?? match.archivedMatch ?? null;
}

export function ProductEntryForm({
  kitchenId,
  mode,
  productId,
  initialProduct = null,
  defaultPutInStock = true,
  initialName = "",
  initialQuantity = "",
  onSuccess,
}: ProductEntryFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(
    initialProduct?.name ?? initialName,
  );
  const [ean, setEan] = useState(initialProduct?.ean ?? "");
  const [defaultUnit, setDefaultUnit] = useState<BaseUnit>(
    (initialProduct?.defaultUnit as BaseUnit | undefined) ?? "gram",
  );
  const [category, setCategory] = useState(initialProduct?.category ?? "");
  const [purchaseMode, setPurchaseMode] = useState<
    UpdateProduct["purchaseMode"]
  >(initialProduct?.purchaseMode ?? "unconfigured");
  const [mediaAssetId, setMediaAssetId] = useState<string | null>(null);
  const [nutrition, setNutrition] = useState<NutritionFormDraft>(() =>
    initialNutritionDraft(
      initialProduct?.nutrition,
      (initialProduct?.defaultUnit as BaseUnit | undefined) ?? "gram",
    ),
  );
  const [hadNutritionInitially] = useState(
    () => Boolean(initialProduct?.nutrition),
  );

  const [putInStock, setPutInStock] = useState(defaultPutInStock);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [inputUnit, setInputUnit] = useState<InputUnit>(
    () =>
      inputUnitsFor(
        (initialProduct?.defaultUnit as BaseUnit | undefined) ?? "gram",
      )[0]?.value ?? "gram",
  );
  const [price, setPrice] = useState("");
  const [storeName, setStoreName] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(todayDateInput);
  const [expiresAt, setExpiresAt] = useState("");
  const [location, setLocation] =
    useState<keyof typeof LOCATION_LABELS>("pantry");

  const [existingProductId, setExistingProductId] = useState<string | null>(
    mode === "create" ? null : (productId ?? initialProduct?.id ?? null),
  );
  const [restoreArchived, setRestoreArchived] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [debouncedName, setDebouncedName] = useState(name.trim());
  const [debouncedEan, setDebouncedEan] = useState(ean.trim());
  const [baselineSnapshot, setBaselineSnapshot] = useState<string | null>(() => {
    if (mode !== "edit" || !initialProduct) {
      return null;
    }
    return JSON.stringify({
      name: initialProduct.name,
      ean: initialProduct.ean ?? "",
      defaultUnit: initialProduct.defaultUnit,
      category: initialProduct.category ?? "",
      purchaseMode: initialProduct.purchaseMode,
      nutrition: initialNutritionDraft(
        initialProduct.nutrition,
        initialProduct.defaultUnit as BaseUnit,
      ),
    });
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedName(name.trim());
      setDebouncedEan(ean.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [name, ean]);

  function applyDefaultUnit(nextUnit: BaseUnit) {
    setDefaultUnit(nextUnit);
    const units = inputUnitsFor(nextUnit);
    setInputUnit((current) =>
      units.some((unit) => unit.value === current)
        ? current
        : (units[0]?.value ?? "gram"),
    );
    setNutrition((current) => {
      if (draftHasNutritionValues(current)) {
        return current.baseUnit === nextUnit
          ? current
          : { ...current, baseUnit: nextUnit };
      }
      return createEmptyNutritionDraft(nextUnit);
    });
  }

  const productsQuery = useQuery({
    queryKey: ["products", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/products",
        { params: { path: { kitchenId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać produktów."));
      }
      return data ?? [];
    },
  });

  const resolvedProduct = useMemo(() => {
    if (initialProduct) {
      return initialProduct;
    }
    const id = productId ?? existingProductId;
    if (!id) {
      return null;
    }
    return productsQuery.data?.find((entry) => entry.id === id) ?? null;
  }, [existingProductId, initialProduct, productId, productsQuery.data]);

  const matchQuery = useQuery({
    queryKey: ["product-match", kitchenId, debouncedName, debouncedEan],
    enabled:
      mode === "create" &&
      !existingProductId &&
      (debouncedName.length >= 2 || debouncedEan.length >= 8),
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/products/match",
        {
          params: {
            path: { kitchenId },
            query: {
              ...(debouncedName ? { name: debouncedName } : {}),
              ...(debouncedEan ? { ean: debouncedEan } : {}),
            },
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się sprawdzić katalogu."),
        );
      }
      return data;
    },
  });

  const stockSummaryQuery = useQuery({
    queryKey: ["stock-summary", kitchenId],
    enabled: mode === "edit" && Boolean(productId ?? resolvedProduct?.id),
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/stock-summary",
        { params: { path: { kitchenId } } },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać podsumowania zapasów."),
        );
      }
      return data ?? [];
    },
  });

  const productStock = useMemo(() => {
    const id = productId ?? resolvedProduct?.id;
    if (!id) {
      return null as StockSummary | null;
    }
    return (
      stockSummaryQuery.data?.find((entry) => entry.productId === id) ?? null
    );
  }, [productId, resolvedProduct?.id, stockSummaryQuery.data]);

  const categoryOptions = useMemo(() => {
    const fromCatalog = new Set<string>(PRODUCT_CATEGORY_OPTIONS);
    for (const product of productsQuery.data ?? []) {
      if (product.category) {
        fromCatalog.add(product.category);
      }
    }
    return Array.from(fromCatalog).sort((a, b) => a.localeCompare(b, "pl"));
  }, [productsQuery.data]);

  const isDirty = useMemo(() => {
    if (mode !== "edit" || !baselineSnapshot) {
      return false;
    }
    const current = JSON.stringify({
      name: name.trim(),
      ean: ean.trim(),
      defaultUnit,
      category: category.trim(),
      purchaseMode,
      nutrition,
    });
    return current !== baselineSnapshot;
  }, [
    baselineSnapshot,
    category,
    defaultUnit,
    ean,
    mode,
    name,
    nutrition,
    purchaseMode,
  ]);

  const stockUnit =
    mode === "add-batch"
      ? ((resolvedProduct?.defaultUnit as BaseUnit | undefined) ?? defaultUnit)
      : existingProductId
        ? ((matchedProduct(matchQuery.data)?.defaultUnit as BaseUnit) ??
          (resolvedProduct?.defaultUnit as BaseUnit | undefined) ??
          defaultUnit)
        : defaultUnit;

  async function discardPendingMedia() {
    if (mediaAssetId) {
      try {
        await deleteKitchenMedia(kitchenId, mediaAssetId);
      } catch {
        // ignore cleanup errors
      }
      setMediaAssetId(null);
    }
  }

  function buildStockPayload():
    | { ok: true; stock: CreateProductIntake["stock"] }
    | { ok: false; message: string } {
    if (mode === "create" && !putInStock) {
      return { ok: true, stock: undefined };
    }
    if (mode === "edit") {
      return { ok: true, stock: undefined };
    }
    const converted = convertToBaseQuantity(quantity, inputUnit, stockUnit);
    if (!converted.ok) {
      return { ok: false, message: converted.message };
    }
    const purchasePriceMinor = price.trim() ? minorFromZloty(price) : null;
    if (price.trim() && purchasePriceMinor === null) {
      return {
        ok: false,
        message: "Podaj cenę w złotych, np. 5,99, albo zostaw puste.",
      };
    }
    return {
      ok: true,
      stock: {
        quantity: converted.quantity,
        location,
        ...(purchasePriceMinor !== null ? { purchasePriceMinor } : {}),
        storeName: storeName.trim() || null,
        purchasedAt: purchasedAt
          ? new Date(purchasedAt).toISOString()
          : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      } as CreateProductIntake["stock"],
    };
  }

  const createIntake = useMutation({
    mutationFn: async () => {
      setFormError(null);
      setFieldErrors({});

      const eanError = validateOptionalEan(ean);
      if (eanError && !existingProductId) {
        setFieldErrors({ ean: eanError });
        throw new Error(eanError);
      }
      if (!existingProductId && !name.trim()) {
        setFieldErrors({ name: "Podaj nazwę produktu." });
        throw new Error("Podaj nazwę produktu.");
      }

      const nutritionResult = buildUpsertProductNutritionDto(nutrition);
      if (!nutritionResult.ok) {
        throw new Error(nutritionResult.message);
      }

      const stockResult = buildStockPayload();
      if (!stockResult.ok) {
        throw new Error(stockResult.message);
      }
      if (
        (mode === "add-batch" || (mode === "create" && putInStock)) &&
        !stockResult.stock
      ) {
        throw new Error("Podaj ilość do odłożenia.");
      }

      const body: CreateProductIntake = {
        idempotencyKey: crypto.randomUUID(),
        restoreArchived,
        ...(nutritionResult.value
          ? { nutrition: nutritionResult.value }
          : {}),
        ...(stockResult.stock ? { stock: stockResult.stock } : {}),
      };

      if (existingProductId || mode === "add-batch") {
        const id =
          existingProductId ??
          productId ??
          resolvedProduct?.id;
        if (!id) {
          throw new Error("Brak produktu do przyjęcia.");
        }
        body.existingProductId = id;
      } else {
        body.newProduct = {
          name: name.trim(),
          defaultUnit,
          ean: ean.trim() || null,
          category: category.trim() || null,
          ...(mediaAssetId ? { imageMediaId: mediaAssetId } : {}),
        };
      }

      const client = createWebApiClient();
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/product-intakes",
        {
          params: { path: { kitchenId } },
          body,
        },
      );
      if (error || !data) {
        throw new Error(
          readApiError(error, "Nie udało się dodać produktu."),
        );
      }
      return data;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
      await queryClient.invalidateQueries({
        queryKey: ["stock-summary", kitchenId],
      });
      await queryClient.invalidateQueries({ queryKey: ["stock", kitchenId] });
      setMediaAssetId(null);
      const putStock = Boolean(result.stockItem);
      const message = result.restoredFromArchive
        ? putStock
          ? "Przywrócono produkt z archiwum i odłożono do zapasów."
          : "Przywrócono produkt z archiwum."
        : putStock
          ? "Dodano produkt i odłożono do zapasów."
          : "Dodano produkt do katalogu.";
      setToast(message);
      onSuccess({
        product: result.product,
        putInStock: putStock,
        mode,
        message,
      });
    },
    onError: (error) => {
      setFormError(readApiError(error));
    },
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      setFormError(null);
      setFieldErrors({});
      const id = productId ?? resolvedProduct?.id;
      if (!id) {
        throw new Error("Brak produktu do edycji.");
      }
      const eanError = validateOptionalEan(ean);
      if (eanError) {
        setFieldErrors({ ean: eanError });
        throw new Error(eanError);
      }
      if (!name.trim()) {
        setFieldErrors({ name: "Podaj nazwę produktu." });
        throw new Error("Podaj nazwę produktu.");
      }

      const nutritionResult = buildUpsertProductNutritionDto(nutrition);
      if (!nutritionResult.ok) {
        throw new Error(nutritionResult.message);
      }

      const client = createWebApiClient();
      const patchBody: UpdateProduct = {
        name: name.trim(),
        defaultUnit,
        ean: ean.trim() || null,
        category: category.trim() || null,
        purchaseMode,
      };
      const { data, error } = await client.PATCH(
        "/api/kitchens/{kitchenId}/products/{productId}",
        {
          params: { path: { kitchenId, productId: id } },
          body: patchBody,
        },
      );
      if (error || !data) {
        throw new Error(
          readApiError(error, "Nie udało się zapisać produktu."),
        );
      }

      if (nutritionResult.value) {
        const { error: nutritionError } = await client.PUT(
          "/api/kitchens/{kitchenId}/products/{productId}/nutrition",
          {
            params: { path: { kitchenId, productId: id } },
            body: nutritionResult.value,
          },
        );
        if (nutritionError) {
          throw new Error(
            readApiError(
              nutritionError,
              "Zapisano produkt, ale nie udało się zapisać wartości odżywczych.",
            ),
          );
        }
      } else if (hadNutritionInitially || resolvedProduct?.nutrition) {
        const { error: deleteError } = await client.DELETE(
          "/api/kitchens/{kitchenId}/products/{productId}/nutrition",
          { params: { path: { kitchenId, productId: id } } },
        );
        if (deleteError) {
          throw new Error(
            readApiError(
              deleteError,
              "Zapisano produkt, ale nie udało się usunąć wartości odżywczych.",
            ),
          );
        }
      }

      return data;
    },
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
      await queryClient.invalidateQueries({
        queryKey: ["product-nutrition", kitchenId, product.id],
      });
      setBaselineSnapshot(
        JSON.stringify({
          name: product.name,
          ean: product.ean ?? "",
          defaultUnit: product.defaultUnit,
          category: product.category ?? "",
          purchaseMode: product.purchaseMode,
          nutrition,
        }),
      );
      setToast("Zapisano zmiany produktu.");
      onSuccess({
        product,
        putInStock: false,
        mode: "edit",
        message: "Zapisano zmiany produktu.",
      });
    },
    onError: (error) => {
      setFormError(readApiError(error));
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "edit") {
      saveEdit.mutate();
      return;
    }
    createIntake.mutate();
  }

  const pending = createIntake.isPending || saveEdit.isPending;
  const match = matchQuery.data;
  const catalogHit = matchedProduct(match);
  const bannerText = matchMessage(match);

  if (mode === "add-batch") {
    return (
      <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Dodaj kolejną partię
          </h1>
          <p className="text-sm text-gray-500">
            {resolvedProduct?.name ?? "Produkt"} — odłóż kupioną ilość do
            zapasów.
          </p>
        </header>
        <StockFields
          quantity={quantity}
          setQuantity={setQuantity}
          inputUnit={inputUnit}
          setInputUnit={setInputUnit}
          stockUnit={stockUnit}
          price={price}
          setPrice={setPrice}
          storeName={storeName}
          setStoreName={setStoreName}
          purchasedAt={purchasedAt}
          setPurchasedAt={setPurchasedAt}
          expiresAt={expiresAt}
          setExpiresAt={setExpiresAt}
          location={location}
          setLocation={setLocation}
        />
        {formError ? (
          <p className="text-sm text-red-600" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="amber" disabled={pending}>
            {pending ? "Zapisywanie…" : "Odłóż do zapasów"}
          </Button>
          <Link
            href={`/kitchens/${kitchenId}/stock`}
            className="inline-flex h-11 items-center rounded-xl border border-gray-200 bg-white px-6 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Anuluj
          </Link>
        </div>
        <Toast message={toast} onDismiss={() => setToast(null)} />
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="relative mx-auto max-w-2xl space-y-8 pb-24">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          {mode === "edit" ? "Edycja produktu" : "Nowy produkt"}
        </h1>
        <p className="text-sm text-gray-500">
          {mode === "edit"
            ? "Zmień dane katalogowe i wartości odżywcze. Nowe partie dodasz osobno."
            : putInStock
              ? "Dodaj produkt do katalogu i od razu odłóż kupioną ilość."
              : "Dodaj produkt do katalogu kuchni."}
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold tracking-wide text-emerald-800 uppercase">
          {mode === "edit" ? "Dane produktu" : "Produkt"}
        </h2>
        {mode === "edit" && resolvedProduct ? (
          <ProductPhotoField
            kitchenId={kitchenId}
            productId={resolvedProduct.id}
            image={resolvedProduct.image}
          />
        ) : (
          <MediaImageField
            kitchenId={kitchenId}
            purpose="product"
            currentImage={null}
            label="Zdjęcie produktu (opcjonalnie)"
            onUploaded={(id) => setMediaAssetId(id)}
            onRemoved={async () => {
              await discardPendingMedia();
            }}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="product-entry-name">Nazwa</Label>
            <Input
              id="product-entry-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (existingProductId && mode === "create") {
                  setExistingProductId(null);
                  setRestoreArchived(false);
                }
              }}
              placeholder="np. Mleko UHT 3,2%"
              required
              disabled={Boolean(existingProductId) && mode === "create"}
            />
            {fieldErrors.name ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="product-entry-ean">EAN (opcjonalnie)</Label>
            <Input
              id="product-entry-ean"
              inputMode="numeric"
              value={ean}
              onChange={(event) => setEan(event.target.value)}
              placeholder="np. 5901234123457"
              disabled={Boolean(existingProductId) && mode === "create"}
            />
            {fieldErrors.ean ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.ean}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="product-entry-unit">Jednostka bazowa</Label>
            <select
              id="product-entry-unit"
              className="field-input"
              value={defaultUnit}
              onChange={(event) =>
                applyDefaultUnit(event.target.value as BaseUnit)
              }
              disabled={Boolean(existingProductId) && mode === "create"}
            >
              {(Object.keys(UNIT_OPTION_LABELS) as BaseUnit[]).map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_OPTION_LABELS[unit]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="product-entry-category">Kategoria</Label>
            <select
              id="product-entry-category"
              className="field-input"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={Boolean(existingProductId) && mode === "create"}
            >
              <option value="">Bez kategorii</option>
              {categoryOptions.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
          {mode === "edit" ? (
            <div className="sm:col-span-2">
              <Label htmlFor="product-entry-purchase-mode">
                Sposób zakupu (purchaseMode)
              </Label>
              <select
                id="product-entry-purchase-mode"
                className="field-input"
                value={purchaseMode}
                onChange={(event) =>
                  setPurchaseMode(
                    event.target.value as UpdateProduct["purchaseMode"],
                  )
                }
              >
                <option value="unconfigured">Nieustawiony</option>
                <option value="packaged">Opakowania</option>
                <option value="exact">Dokładna ilość</option>
              </select>
            </div>
          ) : null}
        </div>

        {mode === "create" && bannerText && catalogHit && !existingProductId ? (
          <div
            className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950"
            role="status"
          >
            <p className="font-medium">{bannerText}</p>
            <p className="mt-1 text-amber-900/80">
              Dopasowanie: {catalogHit.name} ({UNIT_LABELS[catalogHit.defaultUnit]}
              )
              {catalogHit.isArchived ? " · w archiwum" : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="amber"
                onClick={() => {
                  setExistingProductId(catalogHit.id);
                  setRestoreArchived(Boolean(catalogHit.isArchived));
                  setName(catalogHit.name);
                  setEan(catalogHit.ean ?? "");
                  applyDefaultUnit(catalogHit.defaultUnit as BaseUnit);
                  setCategory(catalogHit.category ?? "");
                  setPutInStock(true);
                }}
              >
                {catalogHit.isArchived
                  ? "Przywróć i odłóż do zapasów"
                  : "Użyj istniejącego i odłóż"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setExistingProductId(null);
                  setRestoreArchived(false);
                }}
              >
                Kontynuuj jako nowy
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "create" && existingProductId ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
            <p>
              Przyjmujesz partię dla istniejącego produktu
              {restoreArchived ? " (z przywróceniem z archiwum)" : ""}.
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-emerald-800 underline"
              onClick={() => {
                setExistingProductId(null);
                setRestoreArchived(false);
              }}
            >
              Wróć do tworzenia nowego
            </button>
          </div>
        ) : null}
      </section>

      {mode === "edit" || !existingProductId ? (
        <section className="space-y-3 border-t border-gray-100 pt-6">
          <ProductNutritionEditor
            kitchenId={kitchenId}
            productUnit={defaultUnit}
            ean={ean}
            value={nutrition}
            onChange={setNutrition}
            forceShowFields={mode === "edit" && hadNutritionInitially}
          />
        </section>
      ) : null}

      {mode === "create" ? (
        <section className="space-y-4 border-t border-gray-100 pt-6">
          <h2 className="text-sm font-semibold tracking-wide text-amber-800 uppercase">
            Zakup i zapasy
          </h2>
          <label className="flex items-center gap-3 text-sm text-gray-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              checked={putInStock}
              onChange={(event) => setPutInStock(event.target.checked)}
            />
            Odłóż od razu do zapasów
          </label>
          {putInStock ? (
            <StockFields
              quantity={quantity}
              setQuantity={setQuantity}
              inputUnit={inputUnit}
              setInputUnit={setInputUnit}
              stockUnit={stockUnit}
              price={price}
              setPrice={setPrice}
              storeName={storeName}
              setStoreName={setStoreName}
              purchasedAt={purchasedAt}
              setPurchasedAt={setPurchasedAt}
              expiresAt={expiresAt}
              setExpiresAt={setExpiresAt}
              location={location}
              setLocation={setLocation}
            />
          ) : null}
        </section>
      ) : null}

      {mode === "edit" ? (
        <section className="space-y-3 border-t border-gray-100 pt-6">
          <h2 className="text-sm font-semibold tracking-wide text-amber-800 uppercase">
            Zapasy
          </h2>
          {stockSummaryQuery.isPending ? (
            <p className="text-sm text-gray-500">Ładowanie zapasów…</p>
          ) : productStock ? (
            <div className="rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-sm">
              <p className="font-medium text-gray-900">
                {formatQuantityWithUnit(
                  productStock.totalQuantity,
                  productStock.defaultUnit,
                )}{" "}
                · {productStock.batchCount}{" "}
                {productStock.batchCount === 1 ? "partia" : "partie"}
              </p>
              {productStock.nearestExpiry ? (
                <p className="mt-1 text-xs text-amber-700">
                  Najbliższa ważność:{" "}
                  {new Date(productStock.nearestExpiry).toLocaleDateString(
                    "pl-PL",
                  )}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Brak partii w zapasach.</p>
          )}
          <Link
            href={`/kitchens/${kitchenId}/products/${productId ?? resolvedProduct?.id}/add-batch`}
            className="inline-flex text-sm font-medium text-amber-800 hover:underline"
          >
            Dodaj kolejną partię
          </Link>
          {resolvedProduct ? (
            <ProductPurchaseOptions
              kitchenId={kitchenId}
              productId={resolvedProduct.id}
              defaultUnit={resolvedProduct.defaultUnit as BaseUnit}
              purchaseMode={resolvedProduct.purchaseMode}
            />
          ) : null}
        </section>
      ) : null}

      {formError ? (
        <p className="text-sm text-red-600" role="alert">
          {formError}
        </p>
      ) : null}

      {mode === "create" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending} variant={putInStock ? "amber" : "default"}>
            {pending
              ? "Zapisywanie…"
              : putInStock
                ? "Dodaj produkt i odłóż"
                : "Dodaj tylko do katalogu"}
          </Button>
          <Link
            href={`/kitchens/${kitchenId}/stock`}
            className="inline-flex h-11 items-center rounded-xl border border-gray-200 bg-white px-6 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Anuluj
          </Link>
        </div>
      ) : (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6",
          )}
        >
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {pending
                ? "Zapisywanie…"
                : isDirty
                  ? "Masz niezapisane zmiany"
                  : "Brak zmian do zapisania"}
            </p>
            <div className="flex gap-2">
              <Link
                href={`/kitchens/${kitchenId}/stock`}
                className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-50"
              >
                Wróć
              </Link>
              <Button type="submit" size="sm" disabled={pending || !isDirty}>
                {pending ? "Zapisywanie…" : "Zapisz"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </form>
  );
}

function StockFields({
  quantity,
  setQuantity,
  inputUnit,
  setInputUnit,
  stockUnit,
  price,
  setPrice,
  storeName,
  setStoreName,
  purchasedAt,
  setPurchasedAt,
  expiresAt,
  setExpiresAt,
  location,
  setLocation,
}: {
  quantity: string;
  setQuantity: (value: string) => void;
  inputUnit: InputUnit;
  setInputUnit: (value: InputUnit) => void;
  stockUnit: BaseUnit;
  price: string;
  setPrice: (value: string) => void;
  storeName: string;
  setStoreName: (value: string) => void;
  purchasedAt: string;
  setPurchasedAt: (value: string) => void;
  expiresAt: string;
  setExpiresAt: (value: string) => void;
  location: keyof typeof LOCATION_LABELS;
  setLocation: (value: keyof typeof LOCATION_LABELS) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="entry-qty">Ilość</Label>
        <div className="flex gap-2">
          <Input
            id="entry-qty"
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="0"
            required
            className="flex-1"
          />
          <select
            aria-label="Jednostka ilości"
            className="rounded-lg border border-gray-200 bg-white px-2 text-sm"
            value={inputUnit}
            onChange={(event) =>
              setInputUnit(event.target.value as InputUnit)
            }
          >
            {inputUnitsFor(stockUnit).map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="entry-price">Cena (zł, opcjonalnie)</Label>
        <div className="relative">
          <Input
            id="entry-price"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="0,00"
            className="pr-10"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-gray-400">
            zł
          </span>
        </div>
      </div>
      <div>
        <Label htmlFor="entry-store">Sklep (opcjonalnie)</Label>
        <Input
          id="entry-store"
          value={storeName}
          onChange={(event) => setStoreName(event.target.value)}
          placeholder="np. Lidl"
        />
      </div>
      <div>
        <Label htmlFor="entry-location" className="flex items-center gap-2">
          <MapPin size={14} className="text-gray-400" /> Miejsce
        </Label>
        <select
          id="entry-location"
          className="field-input"
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
      <div>
        <Label htmlFor="entry-purchased" className="flex items-center gap-2">
          <Calendar size={14} className="text-gray-400" /> Data zakupu
        </Label>
        <Input
          id="entry-purchased"
          type="date"
          value={purchasedAt}
          onChange={(event) => setPurchasedAt(event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="entry-expires" className="flex items-center gap-2">
          <Calendar size={14} className="text-gray-400" /> Data ważności
        </Label>
        <Input
          id="entry-expires"
          type="date"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />
      </div>
      <p className="sm:col-span-2 flex items-start gap-2 text-xs text-gray-400">
        <Package size={14} className="mt-0.5 shrink-0" />
        Cena to łączna kwota za tę partię
        {price.trim() && minorFromZloty(price) != null
          ? ` (${formatMoneyMinor(minorFromZloty(price))})`
          : ""}
        .
      </p>
    </div>
  );
}
