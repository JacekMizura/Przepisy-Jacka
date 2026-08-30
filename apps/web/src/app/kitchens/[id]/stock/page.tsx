"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageLightbox } from "@/components/image-lightbox";
import { ProductCatalogPanel } from "@/components/product-entry/product-catalog-panel";
import type { ProductActionItem } from "@/components/stock/product-actions-menu";
import { HistoryTab } from "@/components/stock/history-tab";
import {
  fetchProductRemovalPreview,
  removalDialogCopy,
  undoProductAddition,
  type ProductRemovalPreview,
} from "@/components/stock/removal-preview";
import { StockTab } from "@/components/stock/stock-tab";
import {
  newCatalogProductHref,
  newPurchaseHref,
} from "@/components/stock/stock-view";
import { StockViewTabs } from "@/components/stock/stock-view-tabs";
import { StockConsumeDialog } from "@/components/stock-consume-dialog";
import { Toast } from "@/components/toast";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import {
  inputUnitsFor,
  type BaseUnit,
} from "@/lib/quantity-input";
import {
  asCatalogPage,
  asStockSummaryPage,
  findStockProduct,
  flattenStockProducts,
  type StockProductListItem,
} from "@/lib/stock-list-types";
import {
  applyStockListPatch,
  buildStockListHref,
  parseStockListUrlState,
  type StockListUrlPatch,
} from "@/lib/stock-url-state";

type ProductTarget = { id: string; name: string };

function StockPageInner() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const urlState = useMemo(
    () => parseStockListUrlState(searchParams),
    [searchParams],
  );
  const view = urlState.view;

  const patchUrl = useCallback(
    (patch: StockListUrlPatch) => {
      const next = applyStockListPatch(urlState, patch);
      router.replace(buildStockListHref(kitchenId, next), { scroll: false });
    },
    [kitchenId, router, urlState],
  );

  const [productToArchive, setProductToArchive] = useState<ProductTarget | null>(
    null,
  );
  const [productToUndo, setProductToUndo] = useState<ProductTarget | null>(null);
  const [productWriteOffArchive, setProductWriteOffArchive] = useState<{
    id: string;
    name: string;
    summary?: StockProductListItem;
  } | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [consumeProduct, setConsumeProduct] =
    useState<StockProductListItem | null>(null);
  const [consumePreferManual, setConsumePreferManual] = useState(false);
  const [consumeInitialBatchId, setConsumeInitialBatchId] = useState<
    string | undefined
  >();
  const [consumeAfterWriteOffArchive, setConsumeAfterWriteOffArchive] =
    useState(false);
  const [duplicateProduct, setDuplicateProduct] = useState<ProductTarget | null>(
    null,
  );
  const [toast, setToast] = useState<{
    message: string;
    variant?: "success" | "error" | "info";
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(
    null,
  );
  const [removalCache, setRemovalCache] = useState<
    Record<string, ProductRemovalPreview | null>
  >({});
  const removalFetchedRef = useRef<Set<string>>(new Set());

  const purchaseHref = newPurchaseHref(kitchenId);
  const catalogHref = newCatalogProductHref(kitchenId);

  const stockSummaryQuery = useQuery({
    queryKey: [
      "stock-summary",
      kitchenId,
      urlState.search,
      urlState.category,
      urlState.place,
      urlState.unit,
      urlState.expiryStatus,
      urlState.archived,
      urlState.sort,
      urlState.page,
    ],
    enabled: view === "stock",
    queryFn: async () => {
      const client = createWebApiClient();
      const query: Record<string, string | number> = {
        page: urlState.page,
        limit: 24,
        sort: urlState.sort,
        archived: urlState.archived,
      };
      if (urlState.search) query.search = urlState.search;
      if (urlState.category) query.category = urlState.category;
      if (urlState.place) query.place = urlState.place;
      if (urlState.unit) query.unit = urlState.unit;
      if (urlState.expiryStatus !== "any") {
        query.expiryStatus = urlState.expiryStatus;
      }
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/stock-summary",
        {
          params: {
            path: { kitchenId },
            // Local types until OpenAPI regenerate
            query: query as never,
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać podsumowania zapasów."),
        );
      }
      return asStockSummaryPage(data);
    },
  });

  async function fetchStockProductById(
    productId: string,
  ): Promise<StockProductListItem | null> {
    const client = createWebApiClient();
    const { data, error } = await client.GET(
      "/api/kitchens/{kitchenId}/stock-summary",
      {
        params: {
          path: { kitchenId },
          query: { productId, limit: 10 } as never,
        },
      },
    );
    if (error) {
      return null;
    }
    return findStockProduct(asStockSummaryPage(data).items, productId);
  }

  const catalogQuery = useQuery({
    queryKey: [
      "catalog",
      kitchenId,
      urlState.search,
      urlState.category,
      urlState.place,
      urlState.unit,
      urlState.archived,
      urlState.sort,
      urlState.hasStock,
      urlState.page,
    ],
    enabled: view === "catalog",
    queryFn: async () => {
      const client = createWebApiClient();
      const query: Record<string, string | number> = {
        page: urlState.page,
        limit: 24,
        sort: urlState.sort,
        archived: urlState.archived,
      };
      if (urlState.search) query.search = urlState.search;
      if (urlState.category) query.category = urlState.category;
      if (urlState.place) query.place = urlState.place;
      if (urlState.unit) query.unit = urlState.unit;
      if (urlState.hasStock) query.hasStock = "1";
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/catalog",
        {
          params: {
            path: { kitchenId },
            query: query as never,
          },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać katalogu."));
      }
      return asCatalogPage(data);
    },
  });

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

  const consumptionsQuery = useQuery({
    queryKey: ["stock-consumptions", kitchenId],
    enabled: view === "history",
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
  });

  const invalidateStock = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["stock-summary", kitchenId],
    });
    await queryClient.invalidateQueries({ queryKey: ["stock", kitchenId] });
    await queryClient.invalidateQueries({
      queryKey: ["stock-consumptions", kitchenId],
    });
    await queryClient.invalidateQueries({ queryKey: ["catalog", kitchenId] });
    await queryClient.invalidateQueries({ queryKey: ["products", kitchenId] });
  }, [kitchenId, queryClient]);

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
      await invalidateStock();
      setToast({ message: "Cofnięto zużycie.", variant: "success" });
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
      await invalidateStock();
      setBatchToDelete(null);
      setToast({ message: "Usunięto partię.", variant: "success" });
    },
  });

  const archiveProduct = useMutation({
    mutationFn: async (productId: string) => {
      const client = createWebApiClient();
      const { error, response } = await client.DELETE(
        "/api/kitchens/{kitchenId}/products/{productId}",
        { params: { path: { kitchenId, productId } } },
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
      await invalidateStock();
      setProductToArchive(null);
      setToast({ message: "Produkt zarchiwizowany.", variant: "success" });
    },
    onError: (error: Error) => {
      setToast({ message: error.message, variant: "error" });
      setProductToArchive(null);
    },
  });

  const undoAddition = useMutation({
    mutationFn: async (productId: string) => {
      await undoProductAddition(kitchenId, productId);
    },
    onSuccess: async (_data, productId) => {
      await invalidateStock();
      setProductToUndo(null);
      setToast({
        message: "Cofnięto dodanie produktu.",
        variant: "success",
      });
      removalFetchedRef.current.delete(productId);
      setRemovalCache((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
    },
    onError: (error: Error) => {
      setToast({ message: error.message, variant: "error" });
      setProductToUndo(null);
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
      setToast({
        message: "Produkt dodany do listy zakupów.",
        variant: "success",
      });
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
      setToast({ message: readApiError(error), variant: "error" });
    },
  });

  const stockProducts = useMemo(
    () => flattenStockProducts(stockSummaryQuery.data?.items ?? []),
    [stockSummaryQuery.data],
  );

  useEffect(() => {
    if (view !== "stock" && view !== "catalog") {
      return;
    }
    const missing = stockProducts
      .map((product) => product.productId)
      .filter((id) => !removalFetchedRef.current.has(id))
      .slice(0, 12);
    if (missing.length === 0) {
      return;
    }
    for (const id of missing) {
      removalFetchedRef.current.add(id);
    }
    let cancelled = false;
    void (async () => {
      const updates: Record<string, ProductRemovalPreview | null> = {};
      await Promise.all(
        missing.map(async (productId) => {
          updates[productId] = await fetchProductRemovalPreview(
            kitchenId,
            productId,
          );
        }),
      );
      if (!cancelled) {
        setRemovalCache((current) => ({ ...current, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kitchenId, stockProducts, view]);

  function requestAddToList(product: ProductTarget) {
    addToShoppingList.mutate({ productId: product.id });
  }

  function openConsume(
    summary: StockProductListItem,
    options?: { batchId?: string; preferManual?: boolean },
  ) {
    setConsumePreferManual(Boolean(options?.preferManual));
    setConsumeInitialBatchId(options?.batchId);
    setConsumeAfterWriteOffArchive(false);
    setConsumeProduct(summary);
  }

  function buildMenuItems(args: {
    productId: string;
    productName: string;
    summary?: StockProductListItem;
    groupId?: string | null;
    totalQuantity?: string;
  }): ProductActionItem[] {
    const previewInfo = removalCache[args.productId];
    const qty =
      args.summary != null
        ? Number(args.summary.totalQuantity)
        : Number(args.totalQuantity ?? 0);
    const canUndo = previewInfo?.canUndo === true;
    const showWriteOffArchive =
      qty > 0 &&
      (previewInfo == null || previewInfo.canWriteOffAndArchive === true);
    const groupId = args.groupId ?? args.summary?.groupId ?? null;

    const items: ProductActionItem[] = [
      {
        id: "edit",
        label: "Edytuj produkt",
        href: `/kitchens/${kitchenId}/products/${args.productId}/edit`,
      },
      {
        id: "batch",
        label: "Dodaj partię",
        href: `/kitchens/${kitchenId}/products/${args.productId}/add-batch`,
      },
      {
        id: "list",
        label: "Dodaj do listy zakupów",
        onSelect: () =>
          requestAddToList({ id: args.productId, name: args.productName }),
        disabled: addToShoppingList.isPending,
      },
    ];

    if (groupId) {
      items.push({
        id: "kind",
        label: "Przejdź do rodzaju",
        href: `/kitchens/${kitchenId}/product-groups/${groupId}`,
      });
    } else if (view === "catalog") {
      items.push({
        id: "assign",
        label: "Przypisz do rodzaju",
        href: `/kitchens/${kitchenId}/products/${args.productId}/edit`,
      });
    }

    if (canUndo) {
      items.push({
        id: "undo",
        label: "Cofnij dodanie",
        onSelect: () =>
          setProductToUndo({ id: args.productId, name: args.productName }),
        destructive: true,
      });
    } else {
      items.push({
        id: "archive",
        label: "Archiwizuj",
        onSelect: () =>
          setProductToArchive({ id: args.productId, name: args.productName }),
        destructive: true,
      });
    }

    if (showWriteOffArchive && !canUndo) {
      items.push({
        id: "writeoff-archive",
        label: "Odpisz stan i archiwizuj",
        onSelect: () => {
          if (args.summary) {
            setProductWriteOffArchive({
              id: args.productId,
              name: args.productName,
              summary: args.summary,
            });
          } else {
            const summary = findStockProduct(
              stockSummaryQuery.data?.items ?? [],
              args.productId,
            );
            if (summary) {
              setProductWriteOffArchive({
                id: args.productId,
                name: args.productName,
                summary,
              });
            } else {
              setToast({
                message:
                  "Brak danych zapasu do odpisu. Otwórz produkt i odpisz ręcznie.",
                variant: "info",
              });
            }
          }
        },
        destructive: true,
      });
    }

    return items;
  }

  const headerCta =
    view === "stock" ? (
      <Link
        href={purchaseHref}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white shadow-xl shadow-slate-900/20 transition-all hover:bg-slate-800 md:w-auto"
      >
        <Plus size={20} className="text-emerald-400" />
        Dodaj nowy zakup
      </Link>
    ) : view === "catalog" ? (
      <Link
        href={catalogHref}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-colors hover:bg-slate-800"
      >
        <Plus size={16} className="text-emerald-400" />
        Dodaj produkt do katalogu
      </Link>
    ) : null;

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="-mx-4 -my-4 min-h-[calc(100vh-2rem)] bg-[#f4f7f6] px-6 py-6 sm:-mx-8 sm:-my-8 sm:px-8 sm:py-8 lg:-mx-10 lg:-my-10 lg:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
              Moje zapasy
            </h1>
            <p className="mt-1 font-medium text-slate-500">
              Zarządzaj swoimi produktami w domu
            </p>
          </div>
          <div className="flex w-full shrink-0 items-center justify-end md:w-auto">
            {headerCta}
          </div>
        </header>

        {view === "history" ? (
          <StockViewTabs
            kitchenId={kitchenId}
            active={view}
            urlState={urlState}
            variant="modern"
          />
        ) : null}

        {view === "stock" ? (
          <StockTab
            kitchenId={kitchenId}
            items={stockSummaryQuery.data?.items ?? []}
            page={stockSummaryQuery.data?.page ?? urlState.page}
            pageCount={stockSummaryQuery.data?.pageCount ?? 0}
            total={stockSummaryQuery.data?.total ?? 0}
            isPending={stockSummaryQuery.isPending}
            isError={stockSummaryQuery.isError}
            errorMessage={readApiError(stockSummaryQuery.error)}
            urlState={urlState}
            onUrlPatch={patchUrl}
            onConsume={openConsume}
            onPreviewImage={(src, alt) => setPreview({ src, alt })}
            buildMenuItems={({ productId, productName, summary }) =>
              buildMenuItems({
                productId,
                productName,
                summary,
                groupId: summary.groupId,
              })
            }
          />
        ) : null}

        {view === "catalog" ? (
          <ProductCatalogPanel
            kitchenId={kitchenId}
            embedded
            items={catalogQuery.data?.items ?? []}
            page={catalogQuery.data?.page ?? urlState.page}
            pageCount={catalogQuery.data?.pageCount ?? 0}
            total={catalogQuery.data?.total ?? 0}
            isPending={catalogQuery.isPending}
            isError={catalogQuery.isError}
            errorMessage={readApiError(catalogQuery.error)}
            urlState={urlState}
            onUrlPatch={patchUrl}
            onPreview={(src, alt) => setPreview({ src, alt })}
            onArchiveProduct={setProductToArchive}
            onUndoAddition={setProductToUndo}
            onWriteOffAndArchive={(product) => {
              void (async () => {
                const summary = await fetchStockProductById(product.id);
                if (!summary) {
                  setToast({
                    message:
                      "Brak danych zapasu do odpisu. Otwórz produkt i odpisz ręcznie.",
                    variant: "info",
                  });
                  return;
                }
                setProductWriteOffArchive({ ...product, summary });
              })();
            }}
            onAddToList={requestAddToList}
            addToListPending={addToShoppingList.isPending}
            buildMenuItems={(product) =>
              buildMenuItems({
                productId: product.id,
                productName: product.name,
                groupId: product.groupId,
                totalQuantity: product.totalQuantity,
              })
            }
          />
        ) : null}

        {view === "history" ? (
          <HistoryTab
            entries={consumptionsQuery.data ?? []}
            products={productsQuery.data ?? []}
            isPending={consumptionsQuery.isPending}
            isError={consumptionsQuery.isError}
            errorMessage={readApiError(consumptionsQuery.error)}
            reversePending={reverseConsumption.isPending}
            reverseError={
              reverseConsumption.isError
                ? readApiError(reverseConsumption.error)
                : null
            }
            onReverse={(id) => reverseConsumption.mutate(id)}
          />
        ) : null}
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
          pendingLabel="Archiwizowanie…"
          confirmVariant="amber"
          pending={archiveProduct.isPending}
          onCancel={() => setProductToArchive(null)}
          onConfirm={() => archiveProduct.mutate(productToArchive.id)}
        />
      ) : null}

      {productToUndo ? (
        <ConfirmDialog
          title={`Cofnąć dodanie „${productToUndo.name}”?`}
          description={
            removalDialogCopy(removalCache[productToUndo.id] ?? null)
              .description
          }
          confirmLabel="Cofnij dodanie"
          pendingLabel="Usuwanie…"
          confirmVariant="destructive"
          pending={undoAddition.isPending}
          onCancel={() => setProductToUndo(null)}
          onConfirm={() => undoAddition.mutate(productToUndo.id)}
        />
      ) : null}

      {productWriteOffArchive?.summary ? (
        <ConfirmDialog
          title={`Odpisać stan i zarchiwizować „${productWriteOffArchive.name}”?`}
          description="Najpierw odpiszesz cały pozostały zapas (z podaniem powodu), a potem produkt trafi do archiwum. Historia odpisu zostanie zachowana."
          confirmLabel="Przejdź do odpisu"
          pendingLabel="Otwieranie…"
          confirmVariant="amber"
          pending={false}
          onCancel={() => setProductWriteOffArchive(null)}
          onConfirm={() => {
            const summary = productWriteOffArchive.summary;
            if (!summary) return;
            setConsumePreferManual(true);
            setConsumeInitialBatchId(undefined);
            setConsumeAfterWriteOffArchive(true);
            setConsumeProduct(summary);
            setProductWriteOffArchive(null);
          }}
        />
      ) : null}

      {duplicateProduct ? (
        <ConfirmDialog
          title={`„${duplicateProduct.name}” jest już na liście`}
          description="Ten produkt ma już nierozliczoną pozycję na liście zakupów. Możesz zwiększyć planowaną ilość zamiast dodawać duplikat."
          confirmLabel="Zwiększ ilość"
          pendingLabel="Dodawanie…"
          confirmVariant="default"
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
          pendingLabel="Usuwanie…"
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
            setConsumeAfterWriteOffArchive(false);
          }}
          onSuccess={async () => {
            const shouldArchive =
              consumeAfterWriteOffArchive && consumeProduct;
            await invalidateStock();
            if (shouldArchive) {
              try {
                await archiveProduct.mutateAsync(shouldArchive.productId);
              } catch {
                // błąd już w toast z onError archiwizacji
              }
            }
            setConsumeAfterWriteOffArchive(false);
          }}
        />
      ) : null}

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        actionLabel={toast?.actionLabel}
        onAction={toast?.onAction}
        onDismiss={() => setToast(null)}
        durationMs={toast?.actionLabel ? 6000 : 3500}
      />
      </div>
    </AppShell>
  );
}

export default function StockPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-gray-500">
          Ładowanie zapasów…
        </div>
      }
    >
      <StockPageInner />
    </Suspense>
  );
}
