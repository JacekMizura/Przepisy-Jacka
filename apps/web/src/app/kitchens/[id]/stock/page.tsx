"use client";

import type { components } from "@moja-kuchnia/api-client";
import { Plus, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
import type { LocationFilter } from "@/components/stock/stock-filters";
import { StockTab } from "@/components/stock/stock-tab";
import {
  newCatalogProductHref,
  newPurchaseHref,
  parseStockView,
} from "@/components/stock/stock-view";
import { StockViewTabs } from "@/components/stock/stock-view-tabs";
import { StockConsumeDialog } from "@/components/stock-consume-dialog";
import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import {
  inputUnitsFor,
  type BaseUnit,
} from "@/lib/quantity-input";

type StockSummary = components["schemas"]["StockProductSummaryDto"];

type ProductTarget = { id: string; name: string };

function StockPageInner() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const searchParams = useSearchParams();
  const view = parseStockView(searchParams.get("view"));
  const queryClient = useQueryClient();

  const [locationFilter, setLocationFilter] = useState<LocationFilter>("");
  const [productToArchive, setProductToArchive] = useState<ProductTarget | null>(
    null,
  );
  const [productToUndo, setProductToUndo] = useState<ProductTarget | null>(null);
  const [productWriteOffArchive, setProductWriteOffArchive] = useState<{
    id: string;
    name: string;
    summary?: StockSummary;
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
  const [consumeAfterWriteOffArchive, setConsumeAfterWriteOffArchive] =
    useState(false);
  const [showArchivedCatalog, setShowArchivedCatalog] = useState(false);
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
    enabled: view === "catalog" && showArchivedCatalog,
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
    queryKey: [
      "stock-summary",
      kitchenId,
      view === "stock" ? locationFilter : "",
    ],
    enabled: view === "stock" || view === "catalog",
    queryFn: async () => {
      const client = createWebApiClient();
      const location =
        view === "stock" && locationFilter ? locationFilter : undefined;
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/stock-summary",
        {
          params: {
            path: { kitchenId },
            query: location ? { location } : {},
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
      await invalidateStock();
      setShowArchivedCatalog(true);
      setToast({ message: "Przywrócono produkt.", variant: "success" });
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

  useEffect(() => {
    if (view !== "stock" && view !== "catalog") {
      return;
    }
    const products = productsQuery.data ?? [];
    const missing = products
      .map((product) => product.id)
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
  }, [kitchenId, productsQuery.data, view]);

  function requestAddToList(product: ProductTarget) {
    addToShoppingList.mutate({ productId: product.id });
  }

  function openConsume(
    summary: StockSummary,
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
    summary?: StockSummary;
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

    if (args.groupId) {
      items.push({
        id: "kind",
        label: "Przejdź do rodzaju",
        href: `/kitchens/${kitchenId}/product-groups/${args.groupId}`,
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
            const summary = (stockSummaryQuery.data ?? []).find(
              (entry) => entry.productId === args.productId,
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
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-700"
      >
        <ShoppingBasket size={16} />
        Dodaj zakup
      </Link>
    ) : view === "catalog" ? (
      <Link
        href={catalogHref}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-700"
      >
        <Plus size={16} />
        Dodaj produkt do katalogu
      </Link>
    ) : null;

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                Moje zapasy
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Stan w domu, katalog produktów i historia zużyć.
              </p>
            </div>
            {headerCta}
          </div>
          <StockViewTabs kitchenId={kitchenId} active={view} />
        </header>

        {view === "stock" ? (
          <StockTab
            kitchenId={kitchenId}
            summaries={stockSummaryQuery.data ?? []}
            products={productsQuery.data ?? []}
            isPending={
              stockSummaryQuery.isPending || productsQuery.isPending
            }
            isError={stockSummaryQuery.isError || productsQuery.isError}
            errorMessage={readApiError(
              stockSummaryQuery.error ?? productsQuery.error,
            )}
            locationFilter={locationFilter}
            onLocationFilterChange={setLocationFilter}
            onConsume={openConsume}
            onDeleteBatch={setBatchToDelete}
            onPreviewImage={(src, alt) => setPreview({ src, alt })}
            buildMenuItems={({ productId, productName, summary }) =>
              buildMenuItems({
                productId,
                productName,
                summary,
                groupId: productsQuery.data?.find((p) => p.id === productId)
                  ?.groupId,
              })
            }
          />
        ) : null}

        {view === "catalog" ? (
          <section className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <ProductCatalogPanel
                kitchenId={kitchenId}
                embedded
                onPreview={(src, alt) => setPreview({ src, alt })}
                onArchiveProduct={setProductToArchive}
                onUndoAddition={setProductToUndo}
                onWriteOffAndArchive={(product) => {
                  const summary = (stockSummaryQuery.data ?? []).find(
                    (entry) => entry.productId === product.id,
                  );
                  setProductWriteOffArchive({ ...product, summary });
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
            </div>
          </section>
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
