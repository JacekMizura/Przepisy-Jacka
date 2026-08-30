"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  ChefHat,
  ChevronDown,
  Package,
  Plus,
  ShoppingBasket,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageLightbox } from "@/components/image-lightbox";
import { ProductCatalogPanel } from "@/components/product-entry/product-catalog-panel";
import { StockConsumeDialog } from "@/components/stock-consume-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWebApiClient } from "@/lib/api";
import { LOCATION_LABELS, UNIT_LABELS, readApiError } from "@/lib/errors";
import { formatQuantityWithUnit } from "@/lib/format-quantity";
import { isDisplayableUrl, mediaDisplayUrl } from "@/lib/media-upload";
import { PRODUCT_CATEGORY_OPTIONS } from "@/lib/product-media";
import {
  inputUnitsFor,
  zlotyFromMinor,
  type BaseUnit,
} from "@/lib/quantity-input";
import { cn } from "@/lib/utils";

type Product = components["schemas"]["ProductDto"];
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

const linkButtonSmClass =
  "inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";

export default function StockPage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const queryClient = useQueryClient();
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState<UnitFilter>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [productToArchive, setProductToArchive] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showArchivedCatalog, setShowArchivedCatalog] = useState(false);
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
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(
    null,
  );

  const newProductWithStockHref = `/kitchens/${kitchenId}/products/new?stock=1&from=stock`;
  const newProductCatalogHref = `/kitchens/${kitchenId}/products/new?stock=0&from=catalog`;

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

  const archivedProductsQuery = useQuery({
    queryKey: ["products", kitchenId, "archived"],
    enabled: showArchivedCatalog,
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/products",
        {
          params: {
            path: { kitchenId },
            query: { archive: "archived" },
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać archiwum produktów."),
        );
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

  const archiveProduct = useMutation({
    mutationFn: async () => {
      if (!productToArchive) {
        throw new Error("Brak produktu do archiwizacji.");
      }
      const client = createWebApiClient();
      const { error, response } = await client.DELETE(
        "/api/kitchens/{kitchenId}/products/{productId}",
        {
          params: {
            path: { kitchenId, productId: productToArchive.id },
          },
        },
      );
      if (response.status === 409) {
        throw new Error(
          readApiError(
            error,
            "Nie można zarchiwizować produktu (sprawdź listę zakupów).",
          ),
        );
      }
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się zarchiwizować produktu."),
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
      await queryClient.invalidateQueries({ queryKey: ["catalog", kitchenId] });
      await queryClient.invalidateQueries({
        queryKey: ["stock-summary", kitchenId],
      });
      setProductToArchive(null);
    },
    onError: (error: Error) => {
      setListFeedbackError(true);
      setListFeedback(error.message);
      setProductToArchive(null);
    },
  });

  const restoreProduct = useMutation({
    mutationFn: async (productId: string) => {
      const client = createWebApiClient();
      const { error } = await client.POST(
        "/api/kitchens/{kitchenId}/products/{productId}/restore",
        { params: { path: { kitchenId, productId } } },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się przywrócić produktu."),
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
      await queryClient.invalidateQueries({ queryKey: ["catalog", kitchenId] });
      await queryClient.invalidateQueries({
        queryKey: ["stock-summary", kitchenId],
      });
      setShowArchivedCatalog(true);
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

  function requestAddToList(product: { id: string; name: string }) {
    setListFeedback(null);
    setListFeedbackError(false);
    addToShoppingList.mutate({ productId: product.id });
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
              <Link
                href={newProductWithStockHref}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-amber-200 transition-all hover:bg-amber-600"
              >
                <ShoppingBasket size={18} />
                Dodaj zakupiony produkt
              </Link>
              <Link
                href={newProductCatalogHref}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 transition-all hover:bg-emerald-50"
              >
                <Plus size={18} />
                Dodaj produkt
              </Link>
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
                  Dodaj zakupiony produkt z partią albo sam wpis do katalogu —
                  zobaczysz tu ilości, miejsca i daty ważności.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link
                    href={newProductWithStockHref}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-500 px-6 text-sm font-medium text-white shadow-sm shadow-amber-200 transition-colors hover:bg-amber-600"
                  >
                    Dodaj zakupiony produkt
                  </Link>
                  <Link
                    href={newProductCatalogHref}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-200 bg-white px-6 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-50"
                  >
                    Dodaj produkt
                  </Link>
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
                                  {summary.isArchived ? (
                                    <span className="ml-2 text-xs font-medium text-amber-700">
                                      Zarchiwizowany
                                    </span>
                                  ) : null}
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
                              <Link
                                href={`/kitchens/${kitchenId}/products/${summary.productId}/edit`}
                                className={linkButtonSmClass}
                              >
                                Edytuj
                              </Link>
                              <Link
                                href={`/kitchens/${kitchenId}/products/${summary.productId}/add-batch`}
                                className={linkButtonSmClass}
                              >
                                Dodaj kolejną partię
                              </Link>
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
                            {entry.kind === "write_off" ? (
                              <span className="ml-2 text-xs font-semibold text-rose-800">
                                Odpis
                              </span>
                            ) : (
                              <span className="ml-2 text-xs font-semibold text-gray-600">
                                Zużycie
                              </span>
                            )}
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
                          {entry.reason ? (
                            <p className="text-gray-700">
                              Powód: {entry.reason}
                            </p>
                          ) : null}
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
            <>
              <ProductCatalogPanel
                kitchenId={kitchenId}
                newProductCatalogHref={newProductCatalogHref}
                onPreview={(src, alt) => setPreview({ src, alt })}
                onArchiveProduct={setProductToArchive}
                onAddToList={requestAddToList}
                addToListPending={addToShoppingList.isPending}
              />
              <div className="border-t border-gray-50 px-4 py-3">
                <button
                  type="button"
                  className="text-xs font-medium text-emerald-700 hover:underline"
                  onClick={() => setShowArchivedCatalog((open) => !open)}
                >
                  {showArchivedCatalog
                    ? "Ukryj archiwum produktów"
                    : "Pokaż archiwum produktów"}
                </button>
                {showArchivedCatalog ? (
                  <ul className="mt-3 space-y-2">
                    {(archivedProductsQuery.data ?? []).length === 0 ? (
                      <li className="text-xs text-gray-400">
                        Brak zarchiwizowanych produktów.
                      </li>
                    ) : (
                      (archivedProductsQuery.data ?? []).map((product) => (
                        <li
                          key={product.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-gray-600">{product.name}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={restoreProduct.isPending}
                            onClick={() => restoreProduct.mutate(product.id)}
                          >
                            Przywróć
                          </Button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
                <p className="mt-3 text-xs text-gray-400">
                  Archiwizacja usuwa produkt z aktywnego katalogu. Partie,
                  zakupy, zużycia i przepisy zostają.
                </p>
              </div>
            </>
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

      {productToArchive ? (
        <ConfirmDialog
          title={`Zarchiwizować „${productToArchive.name}”?`}
          description="Produkt zniknie z aktywnego katalogu i selektorów. Historia zakupów, partie, zużycia, zdjęcia i powiązania z przepisami zostaną zachowane. Jeśli ma zapas, nadal zobaczysz go na liście zapasów jako zarchiwizowany."
          confirmLabel="Archiwizuj"
          pending={archiveProduct.isPending}
          onCancel={() => setProductToArchive(null)}
          onConfirm={() => archiveProduct.mutate()}
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
