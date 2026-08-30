"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ChevronDown, Package } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  ProductActionsMenu,
  type ProductActionItem,
} from "@/components/stock/product-actions-menu";
import { Input } from "@/components/ui/input";
import { createWebApiClient } from "@/lib/api";
import { UNIT_LABELS, readApiError } from "@/lib/errors";
import {
  formatQuantityNumber,
  formatQuantityWithUnit,
  unitLabel,
} from "@/lib/format-quantity";
import { isDisplayableUrl, mediaDisplayUrl } from "@/lib/media-upload";
import { cn } from "@/lib/utils";

type KitchenCatalog = components["schemas"]["KitchenCatalogDto"];
type GroupSummary = components["schemas"]["ProductGroupSummaryDto"];
type CatalogProduct = components["schemas"]["CatalogProductDto"];
type ProductGroupDetail = components["schemas"]["ProductGroupDetailDto"];
type MediaImage = components["schemas"]["MediaImageDto"];
type Product = components["schemas"]["ProductDto"];

type ProductCatalogPanelProps = {
  kitchenId: string;
  /** Gdy true — bez wewnętrznego CTA „Dodaj do katalogu” (CTA jest w nagłówku zakładki). */
  embedded?: boolean;
  onPreview?: (src: string, alt: string) => void;
  onArchiveProduct?: (product: { id: string; name: string }) => void;
  onUndoAddition?: (product: { id: string; name: string }) => void;
  onWriteOffAndArchive?: (product: { id: string; name: string }) => void;
  onAddToList?: (product: { id: string; name: string }) => void;
  addToListPending?: boolean;
  buildMenuItems?: (product: {
    id: string;
    name: string;
    groupId?: string | null;
    totalQuantity?: string;
  }) => ProductActionItem[];
};

export function ProductCatalogPanel({
  kitchenId,
  embedded = false,
  onPreview,
  onArchiveProduct,
  onUndoAddition,
  onWriteOffAndArchive,
  onAddToList,
  addToListPending = false,
  buildMenuItems,
}: ProductCatalogPanelProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const catalogQuery = useQuery({
    queryKey: ["catalog", kitchenId, debouncedSearch],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/catalog",
        {
          params: {
            path: { kitchenId },
            query: debouncedSearch ? { search: debouncedSearch } : {},
          },
        },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać katalogu."));
      }
      return data as KitchenCatalog;
    },
  });

  const groups = catalogQuery.data?.groups ?? [];
  const ungrouped = catalogQuery.data?.ungroupedProducts ?? [];
  const empty =
    catalogQuery.isSuccess && groups.length === 0 && ungrouped.length === 0;

  function toggleGroup(groupId: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <div className={cn("space-y-4", !embedded && "border-t border-gray-100 p-4")}>
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Szukaj rodzaju, produktu, marki, EAN…"
        aria-label="Szukaj w katalogu"
        className="sm:max-w-md"
      />

      {catalogQuery.isPending ? (
        <p className="text-sm text-gray-500">Ładowanie katalogu…</p>
      ) : null}
      {catalogQuery.isError ? (
        <p className="text-sm text-red-600" role="alert">
          {readApiError(catalogQuery.error)}
        </p>
      ) : null}

      {empty ? (
        <p className="py-6 text-center text-sm text-gray-500">
          {debouncedSearch
            ? "Brak wyników dla tego wyszukiwania."
            : "Katalog jest pusty — dodaj pierwszy produkt."}
        </p>
      ) : null}

      {groups.length > 0 ? (
        <ul className="divide-y divide-gray-50 overflow-hidden rounded-2xl border border-gray-100 bg-white">
          {groups.map((group) => {
            const expanded = expandedGroups.has(group.id);
            return (
              <li key={group.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                  aria-expanded={expanded}
                  onClick={() => toggleGroup(group.id)}
                >
                  <CoverThumbnails
                    images={group.coverImages}
                    alt={group.name}
                    onPreview={onPreview}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{group.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {group.activeProductCount}{" "}
                      {pluralize(
                        group.activeProductCount,
                        "produkt",
                        "produkty",
                        "produktów",
                      )}
                      {" · "}
                      {formatGroupStock(group)}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Wartości odżywcze: {group.hasNutritionCount}/
                      {group.activeProductCount}
                    </p>
                  </div>
                  <ChevronDown
                    size={18}
                    className={cn(
                      "mt-2 shrink-0 text-gray-400 transition-transform",
                      expanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                {expanded ? (
                  <GroupProductsPanel
                    kitchenId={kitchenId}
                    groupId={group.id}
                    onPreview={onPreview}
                    onArchiveProduct={onArchiveProduct}
                    onUndoAddition={onUndoAddition}
                    onWriteOffAndArchive={onWriteOffAndArchive}
                    onAddToList={onAddToList}
                    addToListPending={addToListPending}
                    buildMenuItems={buildMenuItems}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {ungrouped.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800">
            Pozostałe produkty
          </h3>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white">
            {ungrouped.map((product) => (
              <li key={product.id} className="px-3 py-3 sm:px-4">
                <CatalogProductRow
                  kitchenId={kitchenId}
                  product={product}
                  onPreview={onPreview}
                  onArchiveProduct={onArchiveProduct}
                  onUndoAddition={onUndoAddition}
                  onWriteOffAndArchive={onWriteOffAndArchive}
                  onAddToList={onAddToList}
                  addToListPending={addToListPending}
                  buildMenuItems={buildMenuItems}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function GroupProductsPanel({
  kitchenId,
  groupId,
  onPreview,
  onArchiveProduct,
  onUndoAddition,
  onWriteOffAndArchive,
  onAddToList,
  addToListPending,
  buildMenuItems,
}: {
  kitchenId: string;
  groupId: string;
  onPreview?: (src: string, alt: string) => void;
  onArchiveProduct?: (product: { id: string; name: string }) => void;
  onUndoAddition?: (product: { id: string; name: string }) => void;
  onWriteOffAndArchive?: (product: { id: string; name: string }) => void;
  onAddToList?: (product: { id: string; name: string }) => void;
  addToListPending?: boolean;
  buildMenuItems?: ProductCatalogPanelProps["buildMenuItems"];
}) {
  const detailQuery = useQuery({
    queryKey: ["product-groups", kitchenId, groupId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/product-groups/{groupId}",
        { params: { path: { kitchenId, groupId } } },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać produktów rodzaju."),
        );
      }
      return data as ProductGroupDetail;
    },
  });

  const stockQuery = useQuery({
    queryKey: ["stock-summary", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/stock-summary",
        { params: { path: { kitchenId }, query: {} } },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się pobrać zapasów."),
        );
      }
      return data ?? [];
    },
    staleTime: 30_000,
  });

  if (detailQuery.isPending) {
    return (
      <p className="border-t border-gray-50 bg-gray-50/40 px-4 py-3 text-sm text-gray-500">
        Ładowanie produktów…
      </p>
    );
  }
  if (detailQuery.isError) {
    return (
      <p
        className="border-t border-gray-50 bg-gray-50/40 px-4 py-3 text-sm text-red-600"
        role="alert"
      >
        {readApiError(detailQuery.error)}
      </p>
    );
  }

  const products = (detailQuery.data?.products ?? []).filter(
    (product) => !product.isArchived,
  );
  const stockByProduct = new Map(
    (stockQuery.data ?? []).map((entry) => [entry.productId, entry]),
  );

  if (products.length === 0) {
    return (
      <p className="border-t border-gray-50 bg-gray-50/40 px-4 py-3 text-sm text-gray-500">
        Brak aktywnych produktów w tym rodzaju.{" "}
        <Link
          href={`/kitchens/${kitchenId}/product-groups/${groupId}`}
          className="font-medium text-emerald-700 hover:underline"
        >
          Otwórz rodzaj
        </Link>
      </p>
    );
  }

  return (
    <ul className="border-t border-gray-50 bg-gray-50/40">
      {products.map((product) => {
        const stock = stockByProduct.get(product.id);
        const catalogLike: CatalogProduct = {
          ...product,
          batchCount: stock?.batchCount ?? 0,
          totalQuantity: stock?.totalQuantity ?? "0.000",
        };
        return (
          <li key={product.id} className="border-t border-gray-50 px-3 py-3 sm:px-4">
            <CatalogProductRow
              kitchenId={kitchenId}
              product={catalogLike}
              onPreview={onPreview}
              onArchiveProduct={onArchiveProduct}
              onUndoAddition={onUndoAddition}
              onWriteOffAndArchive={onWriteOffAndArchive}
              onAddToList={onAddToList}
              addToListPending={addToListPending}
              buildMenuItems={buildMenuItems}
            />
          </li>
        );
      })}
      <li className="border-t border-gray-50 px-4 py-2 text-right">
        <Link
          href={`/kitchens/${kitchenId}/product-groups/${groupId}`}
          className="text-xs font-medium text-emerald-700 hover:underline"
        >
          Zarządzaj rodzajem
        </Link>
      </li>
    </ul>
  );
}

function CatalogProductRow({
  kitchenId,
  product,
  onPreview,
  onArchiveProduct,
  onUndoAddition,
  onWriteOffAndArchive,
  onAddToList,
  addToListPending,
  buildMenuItems,
}: {
  kitchenId: string;
  product: CatalogProduct | (Product & { batchCount: number; totalQuantity: string });
  onPreview?: (src: string, alt: string) => void;
  onArchiveProduct?: (product: { id: string; name: string }) => void;
  onUndoAddition?: (product: { id: string; name: string }) => void;
  onWriteOffAndArchive?: (product: { id: string; name: string }) => void;
  onAddToList?: (product: { id: string; name: string }) => void;
  addToListPending?: boolean;
  buildMenuItems?: ProductCatalogPanelProps["buildMenuItems"];
}) {
  const thumb =
    mediaDisplayUrl(product.image, "thumbnail") ??
    (isDisplayableUrl(product.imageUrl) ? product.imageUrl : null);
  const full =
    mediaDisplayUrl(product.image) ??
    (isDisplayableUrl(product.imageUrl) ? product.imageUrl : null);
  const meta = [product.brand, product.variantLabel].filter(Boolean).join(" · ");
  const packageLabel =
    product.packageQuantity && product.packageUnit
      ? `${formatQuantityNumber(product.packageQuantity)}\u00A0${unitLabel(product.packageUnit)}`
      : null;
  const inStock = Number(product.totalQuantity) > 0;

  const menuItems: ProductActionItem[] =
    buildMenuItems?.({
      id: product.id,
      name: product.name,
      groupId: product.groupId,
      totalQuantity: product.totalQuantity,
    }) ??
    defaultCatalogMenuItems({
      kitchenId,
      product,
      onArchiveProduct,
      onUndoAddition,
      onWriteOffAndArchive,
      onAddToList,
      addToListPending,
    });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-50 bg-emerald-50/40",
            full && "hover:shadow-md",
          )}
          disabled={!full || !thumb}
          onClick={() => {
            if (full) {
              onPreview?.(full, product.name);
            }
          }}
          aria-label={full ? `Powiększ zdjęcie: ${product.name}` : undefined}
        >
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e
            <img src={thumb} alt="" className="h-full w-full object-contain" />
          ) : (
            <Package size={18} className="text-emerald-300" />
          )}
        </button>
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{product.name}</p>
          {meta ? (
            <p className="truncate text-xs text-gray-500">{meta}</p>
          ) : null}
          <p className="truncate text-xs text-gray-500">
            {[
              UNIT_LABELS[product.defaultUnit],
              packageLabel ? `opak. ${packageLabel}` : null,
              product.ean ? `EAN ${product.ean}` : null,
              product.nutrition ? "Wartości odżywcze: tak" : "Wartości odżywcze: brak",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-xs text-emerald-800">
            {inStock
              ? formatQuantityWithUnit(product.totalQuantity, product.defaultUnit)
              : "Brak w zapasach"}
            {product.batchCount > 0
              ? ` · ${product.batchCount} ${pluralize(product.batchCount, "partia", "partie", "partii")}`
              : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 self-end sm:self-auto">
        <ProductActionsMenu
          label={`Akcje: ${product.name}`}
          items={menuItems}
        />
      </div>
    </div>
  );
}

function defaultCatalogMenuItems(args: {
  kitchenId: string;
  product: { id: string; name: string; groupId?: string | null; totalQuantity?: string };
  onArchiveProduct?: (product: { id: string; name: string }) => void;
  onUndoAddition?: (product: { id: string; name: string }) => void;
  onWriteOffAndArchive?: (product: { id: string; name: string }) => void;
  onAddToList?: (product: { id: string; name: string }) => void;
  addToListPending?: boolean;
}): ProductActionItem[] {
  const { kitchenId, product } = args;
  const items: ProductActionItem[] = [
    {
      id: "edit",
      label: "Edytuj produkt",
      href: `/kitchens/${kitchenId}/products/${product.id}/edit`,
    },
    {
      id: "batch",
      label: "Dodaj partię",
      href: `/kitchens/${kitchenId}/products/${product.id}/add-batch`,
    },
  ];
  if (args.onAddToList) {
    items.push({
      id: "list",
      label: "Dodaj do listy zakupów",
      onSelect: () => args.onAddToList!({ id: product.id, name: product.name }),
      disabled: args.addToListPending,
    });
  }
  if (product.groupId) {
    items.push({
      id: "kind",
      label: "Przejdź do rodzaju",
      href: `/kitchens/${kitchenId}/product-groups/${product.groupId}`,
    });
  } else {
    items.push({
      id: "assign",
      label: "Przypisz do rodzaju",
      href: `/kitchens/${kitchenId}/products/${product.id}/edit`,
    });
  }
  if (args.onUndoAddition) {
    items.push({
      id: "undo",
      label: "Cofnij dodanie",
      onSelect: () => args.onUndoAddition!({ id: product.id, name: product.name }),
      destructive: true,
    });
  } else if (args.onArchiveProduct) {
    items.push({
      id: "archive",
      label: "Archiwizuj",
      onSelect: () =>
        args.onArchiveProduct!({ id: product.id, name: product.name }),
      destructive: true,
    });
  }
  if (
    args.onWriteOffAndArchive &&
    product.totalQuantity != null &&
    Number(product.totalQuantity) > 0
  ) {
    items.push({
      id: "writeoff-archive",
      label: "Odpisz stan i archiwizuj",
      onSelect: () =>
        args.onWriteOffAndArchive!({ id: product.id, name: product.name }),
      destructive: true,
    });
  }
  return items;
}

function CoverThumbnails({
  images,
  alt,
  onPreview,
}: {
  images: MediaImage[];
  alt: string;
  onPreview?: (src: string, alt: string) => void;
}) {
  const covers = images.slice(0, 4);
  if (covers.length === 0) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50/60">
        <Package size={18} className="text-emerald-300" />
      </div>
    );
  }
  return (
    <div className="flex shrink-0 -space-x-2">
      {covers.map((image, index) => {
        const thumb = mediaDisplayUrl(image, "thumbnail");
        const full = mediaDisplayUrl(image);
        if (!thumb) {
          return null;
        }
        return (
          <button
            key={`${image.mediaAssetId}-${index}`}
            type="button"
            className="relative h-12 w-12 overflow-hidden rounded-xl border-2 border-white bg-emerald-50/40"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (full) {
                onPreview?.(full, alt);
              }
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e */}
            <img src={thumb} alt="" className="h-full w-full object-contain" />
          </button>
        );
      })}
    </div>
  );
}

export function formatGroupStock(group: GroupSummary): string {
  if (group.stockByUnit.length === 0) {
    return "Brak w zapasach";
  }
  return group.stockByUnit
    .map((entry) => formatQuantityWithUnit(entry.totalQuantity, entry.unit))
    .join(" · ");
}

function pluralize(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const abs = Math.abs(count);
  if (abs === 1) {
    return one;
  }
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return few;
  }
  return many;
}
