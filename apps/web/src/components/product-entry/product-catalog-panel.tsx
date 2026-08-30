"use client";

import type { components } from "@moja-kuchnia/api-client";
import { Package, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWebApiClient } from "@/lib/api";
import { UNIT_LABELS, readApiError } from "@/lib/errors";
import { formatQuantityWithUnit } from "@/lib/format-quantity";
import { isDisplayableUrl, mediaDisplayUrl } from "@/lib/media-upload";
import { cn } from "@/lib/utils";

type KitchenCatalog = components["schemas"]["KitchenCatalogDto"];
type GroupSummary = components["schemas"]["ProductGroupSummaryDto"];
type CatalogProduct = components["schemas"]["CatalogProductDto"];
type MediaImage = components["schemas"]["MediaImageDto"];

type ProductCatalogPanelProps = {
  kitchenId: string;
  newProductCatalogHref: string;
  onPreview?: (src: string, alt: string) => void;
  onArchiveProduct?: (product: { id: string; name: string }) => void;
  onAddToList?: (product: { id: string; name: string }) => void;
  addToListPending?: boolean;
};

export function ProductCatalogPanel({
  kitchenId,
  newProductCatalogHref,
  onPreview,
  onArchiveProduct,
  onAddToList,
  addToListPending = false,
}: ProductCatalogPanelProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

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

  return (
    <div className="space-y-4 border-t border-gray-100 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Szukaj rodzaju, produktu, marki, EAN…"
          aria-label="Szukaj w katalogu"
          className="sm:max-w-md"
        />
        <Link
          href={newProductCatalogHref}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
        >
          <Plus size={14} />
          Dodaj do katalogu
        </Link>
      </div>

      {catalogQuery.isPending ? (
        <p className="text-sm text-gray-500">Ładowanie katalogu…</p>
      ) : null}
      {catalogQuery.isError ? (
        <p className="text-sm text-red-600" role="alert">
          {readApiError(catalogQuery.error)}
        </p>
      ) : null}

      {empty ? (
        <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
          {debouncedSearch
            ? "Brak wyników dla tego wyszukiwania."
            : "Katalog jest pusty."}{" "}
          {!debouncedSearch ? (
            <Link
              href={newProductCatalogHref}
              className="font-semibold text-emerald-700 hover:underline"
            >
              Dodaj produkt
            </Link>
          ) : null}
        </div>
      ) : null}

      {groups.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.id}>
              <GroupCatalogCard
                kitchenId={kitchenId}
                group={group}
                onPreview={onPreview}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {ungrouped.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">
            Pozostałe produkty
          </h3>
          <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
            {ungrouped.map((product) => (
              <li key={product.id} className="px-3 py-3">
                <CatalogProductRow
                  kitchenId={kitchenId}
                  product={product}
                  onPreview={onPreview}
                  onArchiveProduct={onArchiveProduct}
                  onAddToList={onAddToList}
                  addToListPending={addToListPending}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function GroupCatalogCard({
  kitchenId,
  group,
  onPreview,
}: {
  kitchenId: string;
  group: GroupSummary;
  onPreview?: (src: string, alt: string) => void;
}) {
  const stockLabel = formatGroupStock(group);
  return (
    <Link
      href={`/kitchens/${kitchenId}/product-groups/${group.id}`}
      className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-gray-900">
            {group.name}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {group.activeProductCount}{" "}
            {pluralize(
              group.activeProductCount,
              "produkt",
              "produkty",
              "produktów",
            )}
            {" · "}
            {group.batchCount}{" "}
            {pluralize(group.batchCount, "partia", "partie", "partii")}
          </p>
          <p className="mt-1 text-xs text-emerald-800">{stockLabel}</p>
        </div>
        <CoverThumbnails
          images={group.coverImages}
          alt={group.name}
          onPreview={onPreview}
        />
      </div>
    </Link>
  );
}

function CatalogProductRow({
  kitchenId,
  product,
  onPreview,
  onArchiveProduct,
  onAddToList,
  addToListPending,
}: {
  kitchenId: string;
  product: CatalogProduct;
  onPreview?: (src: string, alt: string) => void;
  onArchiveProduct?: (product: { id: string; name: string }) => void;
  onAddToList?: (product: { id: string; name: string }) => void;
  addToListPending?: boolean;
}) {
  const thumb =
    mediaDisplayUrl(product.image, "thumbnail") ??
    (isDisplayableUrl(product.imageUrl) ? product.imageUrl : null);
  const full =
    mediaDisplayUrl(product.image) ??
    (isDisplayableUrl(product.imageUrl) ? product.imageUrl : null);
  const meta = [
    product.brand,
    product.variantLabel,
    UNIT_LABELS[product.defaultUnit],
  ]
    .filter(Boolean)
    .join(" · ");

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
          <p className="truncate text-xs text-gray-500">{meta}</p>
          <p className="text-xs text-emerald-800">
            {Number(product.totalQuantity) > 0
              ? formatQuantityWithUnit(
                  product.totalQuantity,
                  product.defaultUnit,
                )
              : "Brak zapasu"}
            {product.batchCount > 0
              ? ` · ${product.batchCount} ${pluralize(product.batchCount, "partia", "partie", "partii")}`
              : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/kitchens/${kitchenId}/products/${product.id}/edit`}
          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-50"
        >
          Edytuj
        </Link>
        <Link
          href={`/kitchens/${kitchenId}/products/${product.id}/add-batch`}
          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-50"
        >
          Dodaj partię
        </Link>
        {onAddToList ? (
          <Button
            size="sm"
            variant="outline"
            disabled={addToListPending}
            onClick={() => onAddToList({ id: product.id, name: product.name })}
          >
            Do listy
          </Button>
        ) : null}
        {onArchiveProduct ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onArchiveProduct({ id: product.id, name: product.name })
            }
          >
            Archiwizuj
          </Button>
        ) : null}
      </div>
    </div>
  );
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
    return "Brak zapasu";
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
