"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  Calendar,
  ChefHat,
  ChevronDown,
  MapPin,
  Package,
  Plus,
  ShoppingBasket,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageField } from "@/components/image-field";
import { ImageLightbox } from "@/components/image-lightbox";
import { MediaImageField } from "@/components/media-image-field";
import {
  draftHasNutritionValues,
  NutritionEanLookup,
  type NutritionFormValues,
} from "@/components/nutrition-ean-lookup";
import { NutritionUsdaLookup } from "@/components/nutrition-usda-lookup";
import { ProductNutritionSection } from "@/components/product-nutrition-section";
import { ProductPhotoField } from "@/components/product-photo-field";
import { ProductPurchaseOptions } from "@/components/product-purchase-options";
import { StockConsumeDialog } from "@/components/stock-consume-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { LOCATION_LABELS, UNIT_LABELS, readApiError } from "@/lib/errors";
import {
  formatNutritionNumber,
  formatQuantityWithUnit,
  toApiQuantityString,
} from "@/lib/format-quantity";
import {
  deleteKitchenMedia,
  isDisplayableUrl,
  mediaDisplayUrl,
} from "@/lib/media-upload";
import {
  PRODUCT_CATEGORY_OPTIONS,
  validateOptionalEan,
} from "@/lib/product-media";
import {
  convertToBaseQuantity,
  inputUnitsFor,
  minorFromZloty,
  zlotyFromMinor,
  type BaseUnit,
  type InputUnit,
} from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

type Product = components["schemas"]["ProductDto"];
type CreateStockItemBody = components["schemas"]["CreateStockItemDto"];
type StockSummary = components["schemas"]["StockProductSummaryDto"];
type LocationFilter = "" | keyof typeof LOCATION_LABELS;
type UnitFilter = "" | BaseUnit;

/** Zdjęcie z magazynu mediów ma pierwszeństwo nad starszym `imageUrl`. */
function productImageUrls(product: Product | undefined): {
  thumbnail: string | null;
  full: string | null;
} {
  if (!product) {
    return { thumbnail: null, full: null };
  }
  const legacy = isDisplayableUrl(product.imageUrl) ? product.imageUrl : null;
  return {
    thumbnail: mediaDisplayUrl(product.image, "thumbnail") ?? legacy,
    full: mediaDisplayUrl(product.image) ?? legacy,
  };
}

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
  const [productNutritionDraft, setProductNutritionDraft] =
    useState<NutritionFormValues | null>(null);
  const [productMediaAssetId, setProductMediaAssetId] = useState<string | null>(
    null,
  );
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
  const [batchToDelete, setBatchToDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [consumeProduct, setConsumeProduct] = useState<StockSummary | null>(
    null,
  );
  const [consumePreferManual, setConsumePreferManual] = useState(false);
  const [consumeInitialBatchId, setConsumeInitialBatchId] = useState<
    string | undefined
  >();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [stockFormOpen, setStockFormOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [listFeedback, setListFeedback] = useState<string | null>(null);
  const [listFeedbackError, setListFeedbackError] = useState(false);
  const [duplicateProduct, setDuplicateProduct] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [expandedStockIds, setExpandedStockIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(
    null,
  );

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

  const stockSummaryQuery = useQuery({
    queryKey: ["stock-summary", kitchenId, locationFilter],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/stock-summary",
        {
          params: {
            path: { kitchenId },
            query: locationFilter ? { location: locationFilter } : {},
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać podsumowania zapasów."),
        );
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

  const consumptionsQuery = useQuery({
    queryKey: ["stock-consumptions", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/stock-consumptions",
        { params: { path: { kitchenId } } },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać historii zużyć."),
        );
      }
      return data ?? [];
    },
    enabled: historyOpen,
  });

  const reverseConsumption = useMutation({
    mutationFn: async (consumptionId: string) => {
      const client = createWebApiClient();
      const { error } = await client.POST(
        "/api/kitchens/{kitchenId}/stock-consumptions/{consumptionId}/reverse",
        {
          params: { path: { kitchenId, consumptionId } },
          body: { idempotencyKey: crypto.randomUUID() },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się cofnąć zużycia."));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["stock-summary", kitchenId],
      });
      await queryClient.invalidateQueries({ queryKey: ["stock", kitchenId] });
      await queryClient.invalidateQueries({
        queryKey: ["stock-consumptions", kitchenId],
      });
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

  const filteredSummary = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return (stockSummaryQuery.data ?? []).filter((summary) => {
      if (categoryFilter) {
        const category = summary.category?.trim() || UNCATEGORIZED;
        if (category !== categoryFilter) {
          return false;
        }
      }
      if (unitFilter && summary.defaultUnit !== unitFilter) {
        return false;
      }
      if (needle) {
        const haystack = [summary.productName, summary.category ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [categoryFilter, searchQuery, stockSummaryQuery.data, unitFilter]);

  const summaryByCategory = useMemo(() => {
    const groups = new Map<string, StockSummary[]>();
    for (const summary of filteredSummary) {
      const key = summary.category?.trim() || UNCATEGORIZED;
      const list = groups.get(key) ?? [];
      list.push(summary);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b, "pl");
    });
  }, [filteredSummary]);

  const toggleStockExpanded = (productId: string) => {
    setExpandedStockIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

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
            category: productCategory.trim() || null,
          },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się dodać produktu."));
      }
      // Zdjęcie wysłane przed zapisem nie ma jeszcze właściciela — przypisz je teraz.
      if (data && productMediaAssetId) {
        const { error: attachError } = await client.POST(
          "/api/kitchens/{kitchenId}/products/{productId}/image",
          {
            params: { path: { kitchenId, productId: data.id } },
            body: { mediaAssetId: productMediaAssetId },
          },
        );
        if (attachError) {
          throw new Error(
            readApiError(
              attachError,
              "Produkt powstał, ale nie udało się przypisać zdjęcia.",
            ),
          );
        }
      }
      if (data && productNutritionDraft) {
        const draft = productNutritionDraft;
        const { error: nutritionError } = await client.PUT(
          "/api/kitchens/{kitchenId}/products/{productId}/nutrition",
          {
            params: { path: { kitchenId, productId: data.id } },
            body: {
              baseQuantity: toApiQuantityString(draft.baseQuantity),
              baseUnit: draft.baseUnit,
              kcal: toApiQuantityString(draft.kcal),
              proteinGrams: toApiQuantityString(draft.proteinGrams),
              carbsGrams: toApiQuantityString(draft.carbsGrams),
              fatGrams: toApiQuantityString(draft.fatGrams),
              fiberGrams: draft.fiberGrams.trim()
                ? toApiQuantityString(draft.fiberGrams)
                : null,
              saltGrams: draft.saltGrams.trim()
                ? toApiQuantityString(draft.saltGrams)
                : null,
              source: draft.source,
              sourceFetchedAt: draft.sourceFetchedAt,
              sourceLabel: draft.sourceLabel,
              sourceBrand: draft.sourceBrand,
              sourceGenericFoodId: draft.sourceGenericFoodId ?? null,
              sourceFdcId: draft.sourceFdcId ?? null,
              sourcePieceGrams: draft.sourcePieceGrams ?? null,
            },
          },
        );
        if (nutritionError) {
          throw new Error(
            readApiError(
              nutritionError,
              "Produkt powstał, ale nie udało się zapisać wartości odżywczych.",
            ),
          );
        }
      }
      return data;
    },
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
      setProductName("");
      setProductEan("");
      setProductNutritionDraft(null);
      setProductMediaAssetId(null);
      setProductCategory("");
      setProductFormOpen(false);
      if (product) {
        setSelectedProductId(product.id);
        const units = inputUnitsFor(product.defaultUnit);
        setInputUnit(units[0]?.value ?? "gram");
        setStockFormOpen(true);
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
      const purchasePriceMinor = price.trim()
        ? minorFromZloty(price)
        : null;
      if (price.trim() && purchasePriceMinor === null) {
        throw new Error("Podaj cenę w złotych, np. 5,99, albo zostaw puste.");
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
            ...(purchasePriceMinor !== null ? { purchasePriceMinor } : {}),
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
            purchasedAt: purchasedAt
              ? new Date(purchasedAt).toISOString()
              : undefined,
            ean: stockEan.trim() || null,
            imageUrl: stockImageUrl.trim() || null,
          } as CreateStockItemBody,
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się dodać partii."));
      }
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stock", kitchenId] });
      await queryClient.invalidateQueries({
        queryKey: ["stock-summary", kitchenId],
      });
      await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
      setQuantity("");
      setPrice("");
      setStockEan("");
      setStockImageUrl("");
      setFormError(null);
      setStockFormOpen(false);
    },
    onError: (error) => {
      setFormError(readApiError(error));
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
      await queryClient.invalidateQueries({
        queryKey: ["stock-summary", kitchenId],
      });
      setBatchToDelete(null);
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

  const addToShoppingList = useMutation({
    mutationFn: async ({
      productId,
      mergeQuantity,
    }: {
      productId: string;
      mergeQuantity?: boolean;
    }) => {
      const client = createWebApiClient();
      const { data, error, response } = await client.POST(
        "/api/kitchens/{kitchenId}/shopping-list/items",
        {
          params: { path: { kitchenId } },
          body: { productId, mergeQuantity },
        },
      );
      if (response.status === 409) {
        throw Object.assign(new Error("duplicate"), { code: "duplicate" });
      }
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się dodać produktu do listy."),
        );
      }
      return data;
    },
    onSuccess: async () => {
      setDuplicateProduct(null);
      setListFeedbackError(false);
      setListFeedback("Produkt dodany do listy zakupów.");
      await queryClient.invalidateQueries({
        queryKey: ["shopping-list", kitchenId],
      });
    },
    onError: (error: Error & { code?: string }, variables) => {
      if (error.code === "duplicate") {
        const product = productsQuery.data?.find(
          (entry) => entry.id === variables.productId,
        );
        if (product) {
          setDuplicateProduct({ id: product.id, name: product.name });
        }
        return;
      }
      setListFeedbackError(true);
      setListFeedback(readApiError(error));
    },
  });

  /** Wysyłka bez zapisanego produktu zostawiłaby zdjęcie bez właściciela. */
  function discardPendingProductMedia() {
    const assetId = productMediaAssetId;
    setProductMediaAssetId(null);
    if (assetId) {
      void deleteKitchenMedia(kitchenId, assetId).catch(() => undefined);
    }
  }

  function toggleProductDetails(productId: string) {
    setExpandedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  function requestAddToList(product: { id: string; name: string }) {
    setListFeedback(null);
    setListFeedbackError(false);
    addToShoppingList.mutate({ productId: product.id });
  }

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
        <header className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50/60 px-6 py-8 sm:px-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-emerald-200/40 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-amber-200/30 blur-3xl"
          />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-700 uppercase shadow-sm ring-1 ring-emerald-100">
                <ChefHat size={14} />
                Spiżarnia kuchni
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Co masz w domu?
              </h1>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <button
                type="button"
                onClick={() => {
                  setStockFormOpen((open) => !open);
                  if (!stockFormOpen) {
                    setProductFormOpen(false);
                  }
                }}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-sm transition-all",
                  stockFormOpen
                    ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
                    : "bg-amber-500 text-white shadow-amber-200 hover:bg-amber-600",
                )}
              >
                <ShoppingBasket size={18} />
                {stockFormOpen ? "Zamknij dodawanie na półkę" : "Odłóż na półkę"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setProductFormOpen((open) => !open);
                  if (!productFormOpen) {
                    setStockFormOpen(false);
                  }
                }}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium transition-all",
                  productFormOpen
                    ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
                    : "bg-white text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50",
                )}
              >
                <Plus size={18} />
                {productFormOpen
                  ? "Zamknij nowy produkt"
                  : "Nowy produkt w katalogu"}
              </button>
            </div>
          </div>
        </header>

        {listFeedback ? (
          <div
            className={cn(
              "rounded-2xl border px-4 py-3 text-sm",
              listFeedbackError
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-100 bg-emerald-50 text-emerald-900",
            )}
            role={listFeedbackError ? "alert" : "status"}
          >
            {listFeedback}
          </div>
        ) : null}

        {productFormOpen ? (
          <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
            <div className="border-b border-emerald-50 bg-emerald-50/40 px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <Plus size={20} className="text-emerald-600" /> Nowy produkt w
                katalogu
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Najpierw dodaj rzecz do katalogu (np. mleko, ryż), potem możesz
                odłożyć konkretną partię na półkę.
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
                  />
                </div>
                <div className="md:col-span-2 space-y-3">
                  <NutritionEanLookup
                    kitchenId={kitchenId}
                    ean={productEan}
                    productUnit={productUnit}
                    hasExistingValues={
                      productNutritionDraft
                        ? draftHasNutritionValues(productNutritionDraft)
                        : false
                    }
                    onApply={(values) => setProductNutritionDraft(values)}
                  />
                  <NutritionUsdaLookup
                    kitchenId={kitchenId}
                    productUnit={productUnit}
                    hasExistingValues={
                      productNutritionDraft
                        ? draftHasNutritionValues(productNutritionDraft)
                        : false
                    }
                    onApply={(values) => setProductNutritionDraft(values)}
                  />
                  {productNutritionDraft ? (
                    <p className="mt-2 text-xs text-emerald-700">
                      Wartości odżywcze są w formularzu
                      ({formatNutritionNumber(productNutritionDraft.kcal, 0)}{" "}
                      kcal /{" "}
                      {formatQuantityWithUnit(
                        productNutritionDraft.baseQuantity,
                        productNutritionDraft.baseUnit,
                      )}
                      ). Zapiszesz je przyciskiem „Dodaj do katalogu”. Nazwa,
                      jednostka i zdjęcie nie zostały zmienione.
                    </p>
                  ) : null}
                </div>
                <div className="md:col-span-2">
                  <MediaImageField
                    kitchenId={kitchenId}
                    purpose="product"
                    currentImage={null}
                    label="Zdjęcie produktu (opcjonalnie)"
                    onUploaded={(mediaAssetId) =>
                      setProductMediaAssetId(mediaAssetId)
                    }
                    onRemoved={async () => {
                      if (productMediaAssetId) {
                        await deleteKitchenMedia(
                          kitchenId,
                          productMediaAssetId,
                        );
                      }
                      setProductMediaAssetId(null);
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2 md:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      discardPendingProductMedia();
                      setProductNutritionDraft(null);
                      setProductFormOpen(false);
                    }}
                  >
                    Anuluj
                  </Button>
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
        ) : null}

        {stockFormOpen ? (
          <section className="overflow-hidden rounded-3xl border border-amber-100 bg-white shadow-sm">
            <div className="border-b border-amber-50 bg-amber-50/50 px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <Package size={20} className="text-amber-600" /> Odłóż na półkę
              </h2>
            </div>
            <div className="p-6">
              <form
                onSubmit={onCreateStock}
                className="grid grid-cols-1 gap-6 md:grid-cols-2"
              >
                <div className="md:col-span-2">
                  <Label htmlFor="stock-product" className="sr-only">
                    Produkt
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
                          inputUnitsFor(product.defaultUnit)[0]?.value ??
                            "gram",
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
                  {(productsQuery.data ?? []).length === 0 ? (
                    <p className="mt-2 text-sm text-amber-800">
                      Katalog jest pusty.{" "}
                      <button
                        type="button"
                        className="font-semibold underline"
                        onClick={() => {
                          setStockFormOpen(false);
                          setProductFormOpen(true);
                        }}
                      >
                        Dodaj najpierw produkt
                      </button>
                      .
                    </p>
                  ) : null}
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
                    Cena zakupu za całość (zł, opcjonalnie)
                  </Label>
                  <Input
                    id="stock-price"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </div>
                <div>
                  <Label
                    htmlFor="stock-expires"
                    className="flex items-center gap-2"
                  >
                    <Calendar size={16} className="text-gray-400" /> Data
                    ważności
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
                  />
                </div>
                <div className="md:col-span-2">
                  <ImageField
                    id="stock-image"
                    value={stockImageUrl}
                    onChange={setStockImageUrl}
                  />
                </div>
                <div className="flex justify-end gap-2 md:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStockFormOpen(false)}
                  >
                    Anuluj
                  </Button>
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
        ) : null}

        <section className="space-y-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">
              Twoja spiżarnia
            </h2>
            <p className="text-sm text-gray-500">
              Przeglądaj to, co już masz — według kategorii, jednostki i miejsca.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm lg:flex-row lg:flex-wrap lg:items-center">
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
                className="field-input py-2"
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
                className="field-input py-2"
                value={unitFilter}
                onChange={(event) =>
                  setUnitFilter(event.target.value as UnitFilter)
                }
              >
                <option value="">Wszystkie</option>
                {(Object.keys(UNIT_OPTION_LABELS) as BaseUnit[]).map((unit) => (
                  <option key={unit} value={unit}>
                    {UNIT_OPTION_LABELS[unit]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-500">
              <span className="font-medium whitespace-nowrap">Miejsce:</span>
              <select
                className="field-input py-2"
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

          <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            {stockSummaryQuery.isPending || productsQuery.isPending ? (
              <div className="p-12 text-center text-sm text-gray-500">
                Ładowanie spiżarni…
              </div>
            ) : null}
            {stockSummaryQuery.isError ? (
              <div className="p-12 text-center text-sm text-red-600" role="alert">
                {readApiError(stockSummaryQuery.error)}
              </div>
            ) : null}
            {!stockSummaryQuery.isPending &&
            !stockSummaryQuery.isError &&
            filteredSummary.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <ChefHat size={32} />
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  Spiżarnia czeka na pierwsze produkty
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                  Dodaj produkt do katalogu, a potem odłóż partię na półkę —
                  zobaczysz tu ilości, miejsca i daty ważności.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      setProductFormOpen(true);
                      setStockFormOpen(false);
                    }}
                  >
                    Nowy produkt
                  </Button>
                  <Button
                    type="button"
                    variant="amber"
                    onClick={() => {
                      setStockFormOpen(true);
                      setProductFormOpen(false);
                    }}
                  >
                    Odłóż na półkę
                  </Button>
                </div>
              </div>
            ) : null}
            {filteredSummary.length > 0 ? (
              <ul className="divide-y divide-gray-50">
                {summaryByCategory.map(([category, summaries]) => (
                  <Fragment key={category}>
                    <li className="bg-emerald-50/40 px-4 py-2 text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                      {category}
                    </li>
                    {summaries.map((summary) => {
                      const product = productsQuery.data?.find(
                        (entry) => entry.id === summary.productId,
                      );
                      const productImages = productImageUrls(product);
                      const thumbnail = productImages.thumbnail;
                      const fullSize = productImages.full;
                      const expanded = expandedStockIds.has(summary.productId);
                      const expiryHint =
                        summary.expiringBatchCount > 0 && summary.nearestExpiry
                          ? `${summary.expiringBatchCount} ${
                              summary.expiringBatchCount === 1
                                ? "partia"
                                : "partie"
                            } kończą ważność ${new Date(
                              summary.nearestExpiry,
                            ).toLocaleDateString("pl-PL")}`
                          : null;
                      return (
                        <li key={summary.productId} className="px-4 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              {thumbnail && fullSize ? (
                                <button
                                  type="button"
                                  className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-50 bg-emerald-50/40 transition-shadow hover:shadow-md"
                                  onClick={() =>
                                    setPreview({
                                      src: fullSize,
                                      alt: summary.productName,
                                    })
                                  }
                                  aria-label={`Powiększ zdjęcie: ${summary.productName}`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć */}
                                  <img
                                    src={thumbnail}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                </button>
                              ) : (
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-50 bg-emerald-50/40">
                                  <Package
                                    size={18}
                                    className="text-emerald-300"
                                  />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-gray-900">
                                  {summary.productName}
                                </p>
                                <p className="text-sm text-gray-600">
                                  {formatQuantityWithUnit(
                                    summary.totalQuantity,
                                    summary.defaultUnit,
                                  )}{" "}
                                  · {summary.batchCount}{" "}
                                  {summary.batchCount === 1
                                    ? "partia"
                                    : "partie"}
                                </p>
                                {expiryHint ? (
                                  <p className="mt-0.5 text-xs text-amber-700">
                                    {expiryHint}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  toggleStockExpanded(summary.productId)
                                }
                                aria-expanded={expanded}
                              >
                                <ChevronDown
                                  size={16}
                                  className={cn(
                                    "mr-1 transition-transform",
                                    expanded && "rotate-180",
                                  )}
                                />
                                {expanded ? "Zwiń" : "Partie"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="amber"
                                onClick={() => {
                                  setConsumePreferManual(false);
                                  setConsumeInitialBatchId(undefined);
                                  setConsumeProduct(summary);
                                }}
                              >
                                Zużyj
                              </Button>
                            </div>
                          </div>
                          {expanded ? (
                            <ul className="mt-3 space-y-2 border-t border-gray-50 pt-3">
                              {summary.batches.map((batch) => (
                                <li
                                  key={batch.id}
                                  className={cn(
                                    "rounded-xl border p-3 text-sm",
                                    batch.isExpired
                                      ? "border-red-100 bg-red-50/40"
                                      : "border-gray-100 bg-gray-50/60",
                                  )}
                                >
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-1">
                                      <p className="font-medium text-gray-900">
                                        {formatQuantityWithUnit(
                                          batch.quantity,
                                          summary.defaultUnit,
                                        )}{" "}
                                        /{" "}
                                        {formatQuantityWithUnit(
                                          batch.initialQuantity,
                                          summary.defaultUnit,
                                        )}
                                        {batch.isExpired ? (
                                          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">
                                            Przeterminowane
                                          </span>
                                        ) : null}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {batch.storeName
                                          ? batch.storeName
                                          : "Ręczne dodanie"}
                                        {batch.purchasedAt
                                          ? ` · ${new Date(
                                              batch.purchasedAt,
                                            ).toLocaleDateString("pl-PL")}`
                                          : ""}
                                        {batch.expiresAt
                                          ? ` · ważne do ${new Date(
                                              batch.expiresAt,
                                            ).toLocaleDateString("pl-PL")}`
                                          : ""}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {LOCATION_LABELS[batch.location]}
                                        {batch.unitPriceMinor != null
                                          ? ` · ${zlotyFromMinor(
                                              batch.unitPriceMinor,
                                            )} ${batch.currency}/${UNIT_LABELS[summary.defaultUnit]}`
                                          : batch.purchasePriceMinor != null
                                            ? ` · ${zlotyFromMinor(
                                                batch.purchasePriceMinor,
                                              )} ${batch.currency} za partię`
                                            : " · cena nieznana"}
                                      </p>
                                      {batch.purchaseId ? (
                                        <Link
                                          href={`/kitchens/${kitchenId}/purchases/${batch.purchaseId}`}
                                          className="text-xs font-medium text-emerald-700 hover:underline"
                                        >
                                          Zobacz zakup / paragon
                                        </Link>
                                      ) : null}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {!batch.canDelete ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            setConsumePreferManual(true);
                                            setConsumeInitialBatchId(batch.id);
                                            setConsumeProduct(summary);
                                          }}
                                        >
                                          Odpisz
                                        </Button>
                                      ) : (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="destructive"
                                          onClick={() =>
                                            setBatchToDelete({
                                              id: batch.id,
                                              label: `${summary.productName} (${formatQuantityWithUnit(
                                                batch.quantity,
                                                summary.defaultUnit,
                                              )})`,
                                            })
                                          }
                                        >
                                          Usuń partię
                                        </Button>
                                      )}
                                      {batch.isExpired && batch.canDelete ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            setConsumePreferManual(true);
                                            setConsumeInitialBatchId(batch.id);
                                            setConsumeProduct(summary);
                                          }}
                                        >
                                          Odpisz
                                        </Button>
                                      ) : null}
                                    </div>
                                    {batch.deleteBlockReason ? (
                                      <p className="mt-2 text-xs text-gray-500">
                                        {batch.deleteBlockReason}
                                      </p>
                                    ) : null}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </Fragment>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50/80"
            aria-expanded={historyOpen}
          >
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Historia zużyć
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Podgląd zatwierdzonych odpisań i cofnięć — bez kasowania historii.
              </p>
            </div>
            <ChevronDown
              size={20}
              className={cn(
                "shrink-0 text-gray-400 transition-transform",
                historyOpen && "rotate-180",
              )}
            />
          </button>
          {historyOpen ? (
            <div className="border-t border-gray-100">
              {consumptionsQuery.isPending ? (
                <p className="p-6 text-sm text-gray-500">Ładowanie historii…</p>
              ) : null}
              {consumptionsQuery.isError ? (
                <p className="p-6 text-sm text-red-600" role="alert">
                  {readApiError(consumptionsQuery.error)}
                </p>
              ) : null}
              {!consumptionsQuery.isPending &&
              (consumptionsQuery.data?.length ?? 0) === 0 ? (
                <p className="p-6 text-sm text-gray-500">
                  Brak zapisanych zużyć. Użyj „Zużyj” lub „Odpisz”, aby skorygować
                  stan partii.
                </p>
              ) : null}
              {(consumptionsQuery.data ?? []).length > 0 ? (
                <ul className="divide-y divide-gray-50">
                  {(consumptionsQuery.data ?? []).map((entry) => (
                    <li key={entry.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <p className="font-medium text-gray-900">
                            {entry.productName ?? entry.productId}
                            {entry.isReversal ? (
                              <span className="ml-2 text-xs font-semibold text-amber-800">
                                Cofnięcie
                              </span>
                            ) : null}
                            {entry.isReversed ? (
                              <span className="ml-2 text-xs font-semibold text-gray-500">
                                Cofnięte
                              </span>
                            ) : null}
                          </p>
                          <p className="text-gray-600">
                            {formatQuantityWithUnit(
                              entry.totalQuantity,
                              productsQuery.data?.find(
                                (p) => p.id === entry.productId,
                              )?.defaultUnit,
                            )}
                            {" · "}
                            {entry.costComplete && entry.totalCostMinor != null
                              ? `${zlotyFromMinor(entry.totalCostMinor)} zł`
                              : "koszt niekompletny"}
                            {" · "}
                            {new Date(entry.createdAt).toLocaleString("pl-PL")}
                          </p>
                          <ul className="text-xs text-gray-500">
                            {entry.lines.map((line) => (
                              <li key={`${entry.id}-${line.stockItemId}`}>
                                {formatQuantityWithUnit(
                                  line.quantity,
                                  productsQuery.data?.find(
                                    (p) => p.id === entry.productId,
                                  )?.defaultUnit,
                                )}
                                {line.storeName ? ` · ${line.storeName}` : ""}
                                {line.costMinor != null
                                  ? ` · ${zlotyFromMinor(line.costMinor)} zł`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {!entry.isReversal && !entry.isReversed ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={reverseConsumption.isPending}
                            onClick={() =>
                              reverseConsumption.mutate(entry.id)
                            }
                          >
                            Cofnij
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {reverseConsumption.isError ? (
                <p className="border-t border-gray-50 px-4 py-3 text-sm text-red-600">
                  {readApiError(reverseConsumption.error)}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setCatalogOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50/80"
            aria-expanded={catalogOpen}
          >
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Katalog produktów
              </h2>
            </div>
            <ChevronDown
              size={20}
              className={cn(
                "shrink-0 text-gray-400 transition-transform",
                catalogOpen && "rotate-180",
              )}
            />
          </button>
          {catalogOpen ? (
            <div className="border-t border-gray-100">
              {(productsQuery.data ?? []).length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Katalog jest pusty. Dodaj pierwszy produkt przyciskiem u góry.
                </div>
              ) : (
                <ul>
                  {(productsQuery.data ?? []).map((product) => {
                    const hasStock = (stockQuery.data ?? []).some(
                      (item) => item.productId === product.id,
                    );
                    const { thumbnail, full } = productImageUrls(product);
                    const detailsOpen = expandedProductIds.has(product.id);
                    return (
                      <li
                        key={product.id}
                        className="border-b border-gray-100 px-4 py-3 last:border-0"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            {thumbnail && full ? (
                              <button
                                type="button"
                                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-50 bg-emerald-50/40 transition-shadow hover:shadow-md"
                                onClick={() =>
                                  setPreview({
                                    src: full,
                                    alt: product.name,
                                  })
                                }
                                aria-label={`Powiększ zdjęcie: ${product.name}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć */}
                                <img
                                  src={thumbnail}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-50 bg-emerald-50/40">
                                <Package
                                  size={18}
                                  className="text-emerald-300"
                                />
                              </div>
                            )}
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
                              {product.nutrition ? (
                                <p className="mt-1 text-xs text-emerald-700">
                                  {formatNutritionNumber(
                                    product.nutrition.kcal,
                                    0,
                                  )}{" "}
                                  kcal /{" "}
                                  {formatQuantityWithUnit(
                                    product.nutrition.baseQuantity,
                                    product.nutrition.baseUnit,
                                  )}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                requestAddToList({
                                  id: product.id,
                                  name: product.name,
                                })
                              }
                              disabled={addToShoppingList.isPending}
                            >
                              Dodaj do listy zakupów
                            </Button>
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
                            <Button
                              size="sm"
                              variant={detailsOpen ? "secondary" : "outline"}
                              aria-expanded={detailsOpen}
                              onClick={() => toggleProductDetails(product.id)}
                            >
                              {detailsOpen ? "Zwiń szczegóły" : "Szczegóły"}
                              <ChevronDown
                                size={14}
                                className={cn(
                                  "ml-1 transition-transform",
                                  detailsOpen && "rotate-180",
                                )}
                              />
                            </Button>
                          </div>
                        </div>
                        {detailsOpen ? (
                          <>
                            <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                              <ProductPhotoField
                                kitchenId={kitchenId}
                                productId={product.id}
                                image={product.image}
                              />
                            </div>
                            <ProductNutritionSection
                              kitchenId={kitchenId}
                              productId={product.id}
                              productName={product.name}
                              productEan={product.ean}
                              defaultUnit={product.defaultUnit as BaseUnit}
                              nutrition={product.nutrition}
                            />
                            <ProductPurchaseOptions
                              kitchenId={kitchenId}
                              productId={product.id}
                              defaultUnit={product.defaultUnit as BaseUnit}
                              purchaseMode={product.purchaseMode}
                            />
                          </>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="border-t border-gray-50 px-4 py-3 text-xs text-gray-400">
                Usunięcie produktu z katalogu usuwa też wszystkie jego partie na
                półkach.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      {preview ? (
        <ImageLightbox
          src={preview.src}
          alt={preview.alt}
          caption={preview.alt}
          onClose={() => setPreview(null)}
        />
      ) : null}

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

      {duplicateProduct ? (
        <ConfirmDialog
          title={`„${duplicateProduct.name}” jest już na liście`}
          description="Ten produkt ma już nierozliczoną pozycję na liście zakupów. Możesz zwiększyć planowaną ilość zamiast dodawać duplikat."
          confirmLabel="Zwiększ ilość"
          pending={addToShoppingList.isPending}
          onCancel={() => setDuplicateProduct(null)}
          onConfirm={() =>
            addToShoppingList.mutate({
              productId: duplicateProduct.id,
              mergeQuantity: true,
            })
          }
        />
      ) : null}

      {batchToDelete ? (
        <ConfirmDialog
          title="Usunąć partię?"
          description={`Fizycznie usuniesz „${batchToDelete.label}”. To dozwolone tylko dla ręcznie dodanej partii bez zakupu i bez historii zużycia.`}
          confirmLabel="Usuń partię"
          pending={deleteStock.isPending}
          onCancel={() => setBatchToDelete(null)}
          onConfirm={() => deleteStock.mutate(batchToDelete.id)}
        />
      ) : null}

      {consumeProduct ? (
        <StockConsumeDialog
          kitchenId={kitchenId}
          product={consumeProduct}
          inputUnit={
            inputUnitsFor(consumeProduct.defaultUnit as BaseUnit)[0]?.value ??
            "gram"
          }
          open={Boolean(consumeProduct)}
          preferManual={consumePreferManual}
          initialBatchId={consumeInitialBatchId}
          onClose={() => {
            setConsumeProduct(null);
            setConsumePreferManual(false);
            setConsumeInitialBatchId(undefined);
          }}
          onSuccess={async () => {
            await queryClient.invalidateQueries({
              queryKey: ["stock-summary", kitchenId],
            });
            await queryClient.invalidateQueries({
              queryKey: ["stock", kitchenId],
            });
            await queryClient.invalidateQueries({
              queryKey: ["stock-consumptions", kitchenId],
            });
          }}
        />
      ) : null}
    </AppShell>
  );
}
