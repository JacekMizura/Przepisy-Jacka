"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ChevronDown, Package } from "lucide-react";
import Link from "next/link";

import { ProductCategoryBadge } from "@/components/product-entry/product-category-selector";
import {
  ProductActionsMenu,
  type ProductActionItem,
} from "@/components/stock/product-actions-menu";
import { Button } from "@/components/ui/button";
import { LOCATION_LABELS } from "@/lib/errors";
import { formatQuantityWithUnit } from "@/lib/format-quantity";
import { isDisplayableUrl, mediaDisplayUrl } from "@/lib/media-upload";
import {
  formatBatchPricePresentation,
  formatBatchQuantityPresentation,
  formatProductStockHeadline,
} from "@/lib/stock-package-display";
import { cn } from "@/lib/utils";

type Product = components["schemas"]["ProductDto"];
type StockSummary = components["schemas"]["StockProductSummaryDto"];
type StockBatch = components["schemas"]["StockBatchDetailDto"];

export function productImageUrls(product: Product | undefined): {
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

export function brandVariantLabel(product: Product | undefined): string | null {
  if (!product) {
    return null;
  }
  const parts = [product.brand, product.variantLabel].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function expiryHint(summary: StockSummary): string | null {
  if (summary.expiringBatchCount > 0 && summary.nearestExpiry) {
    const date = new Date(summary.nearestExpiry).toLocaleDateString("pl-PL");
    const count = summary.expiringBatchCount;
    return count === 1
      ? `Kończy ważność ${date}`
      : `${count} partie kończą ważność ${date}`;
  }
  if (summary.nearestExpiry) {
    return `Najbliżej: ${new Date(summary.nearestExpiry).toLocaleDateString("pl-PL")}`;
  }
  return null;
}

export function pluralizeBatches(count: number): string {
  if (count === 1) return "1 partia";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return `${count} partie`;
  }
  return `${count} partii`;
}

type StockProductRowProps = {
  kitchenId: string;
  summary: StockSummary;
  product?: Product;
  kindBadge?: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onConsume: () => void;
  onPreviewImage?: (src: string, alt: string) => void;
  menuItems: ProductActionItem[];
  onWriteOffBatch: (batchId: string) => void;
  onDeleteBatch: (batch: { id: string; label: string }) => void;
  nested?: boolean;
};

export function StockProductRow({
  kitchenId,
  summary,
  product,
  kindBadge,
  expanded,
  onToggleExpanded,
  onConsume,
  onPreviewImage,
  menuItems,
  onWriteOffBatch,
  onDeleteBatch,
  nested = false,
}: StockProductRowProps) {
  const images = productImageUrls(product);
  const meta = brandVariantLabel(product);
  const hint = expiryHint(summary);

  return (
    <li
      className={cn(
        nested ? "border-t border-gray-50 px-3 py-3 sm:px-4" : "px-4 py-3",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          <ProductThumb
            thumbnail={images.thumbnail}
            full={images.full}
            alt={summary.productName}
            onPreview={onPreviewImage}
          />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-gray-900">{summary.productName}</p>
              {kindBadge ? (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-100">
                  {kindBadge}
                </span>
              ) : null}
              {summary.isArchived ? (
                <span className="text-xs font-medium text-amber-700">
                  Zarchiwizowany
                </span>
              ) : null}
            </div>
            {(product?.category ?? summary.category) ? (
              <ProductCategoryBadge
                category={product?.category ?? summary.category}
                className="mt-0.5 text-xs"
              />
            ) : null}
            {meta ? (
              <p className="truncate text-xs text-gray-500">{meta}</p>
            ) : null}
            <p className="mt-0.5 text-sm text-gray-600">
              {formatProductStockHeadline({
                totalQuantity: summary.totalQuantity,
                defaultUnit: summary.defaultUnit,
                batchCount: summary.batchCount,
                batches: summary.batches,
              })}
            </p>
            {hint ? (
              <p className="mt-0.5 text-xs text-amber-700">{hint}</p>
            ) : null}
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
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
          <Button type="button" size="sm" variant="amber" onClick={onConsume}>
            Zużyj
          </Button>
          <ProductActionsMenu
            label={`Akcje: ${summary.productName}`}
            items={menuItems}
          />
        </div>
      </div>
      {expanded ? (
        <StockBatchList
          kitchenId={kitchenId}
          summary={summary}
          onWriteOffBatch={onWriteOffBatch}
          onDeleteBatch={onDeleteBatch}
        />
      ) : null}
    </li>
  );
}

function ProductThumb({
  thumbnail,
  full,
  alt,
  onPreview,
}: {
  thumbnail: string | null;
  full: string | null;
  alt: string;
  onPreview?: (src: string, alt: string) => void;
}) {
  if (thumbnail && full && onPreview) {
    return (
      <button
        type="button"
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-50 bg-emerald-50/40 transition-shadow hover:shadow-md"
        onClick={(event) => {
          event.stopPropagation();
          onPreview(full, alt);
        }}
        aria-label={`Powiększ zdjęcie: ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć */}
        <img src={thumbnail} alt="" className="h-full w-full object-contain" />
      </button>
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-50 bg-emerald-50/40">
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć
        <img src={thumbnail} alt="" className="h-full w-full object-contain" />
      ) : (
        <Package size={18} className="text-emerald-300" />
      )}
    </div>
  );
}

function StockBatchList({
  kitchenId,
  summary,
  onWriteOffBatch,
  onDeleteBatch,
}: {
  kitchenId: string;
  summary: StockSummary;
  onWriteOffBatch: (batchId: string) => void;
  onDeleteBatch: (batch: { id: string; label: string }) => void;
}) {
  return (
    <ul className="mt-3 space-y-2 border-t border-gray-50 pt-3">
      {summary.batches.map((batch) => (
        <StockBatchRow
          key={batch.id}
          kitchenId={kitchenId}
          batch={batch}
          unit={summary.defaultUnit}
          productName={summary.productName}
          onWriteOff={() => onWriteOffBatch(batch.id)}
          onDelete={() =>
            onDeleteBatch({
              id: batch.id,
              label: `${summary.productName} (${formatQuantityWithUnit(
                batch.quantity,
                summary.defaultUnit,
              )})`,
            })
          }
        />
      ))}
    </ul>
  );
}

function StockBatchRow({
  kitchenId,
  batch,
  unit,
  productName,
  onWriteOff,
  onDelete,
}: {
  kitchenId: string;
  batch: StockBatch;
  unit: StockSummary["defaultUnit"];
  productName: string;
  onWriteOff: () => void;
  onDelete: () => void;
}) {
  const qty = formatBatchQuantityPresentation(batch, unit);
  const priceLine = formatBatchPricePresentation(batch);

  return (
    <li
      className={cn(
        "rounded-xl border p-3 text-sm",
        batch.isExpired
          ? "border-red-100 bg-red-50/40"
          : "border-gray-100 bg-gray-50/60",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-gray-900">
            {qty.primary}
            {batch.isExpired ? (
              <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">
                Przeterminowane
              </span>
            ) : null}
          </p>
          {qty.secondary ? (
            <p className="text-xs text-gray-500">{qty.secondary}</p>
          ) : null}
          <p className="text-xs text-gray-500">
            {batch.storeName ? batch.storeName : "Ręczne dodanie"}
            {batch.purchasedAt
              ? ` · zakup ${new Date(batch.purchasedAt).toLocaleDateString("pl-PL")}`
              : ""}
            {batch.expiresAt
              ? ` · ważne do ${new Date(batch.expiresAt).toLocaleDateString("pl-PL")}`
              : ""}
          </p>
          <p className="text-xs text-gray-500">
            {LOCATION_LABELS[batch.location]}
            {priceLine ? ` · ${priceLine}` : " · cena nieznana"}
          </p>
          {batch.purchaseId ? (
            <Link
              href={`/kitchens/${kitchenId}/purchases/${batch.purchaseId}`}
              className="text-xs font-medium text-emerald-700 hover:underline"
            >
              Zobacz zakup / paragon
            </Link>
          ) : null}
          {batch.deleteBlockReason ? (
            <p className="text-xs text-gray-500">{batch.deleteBlockReason}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!batch.canDelete || batch.isExpired ? (
            <Button type="button" size="sm" variant="amber" onClick={onWriteOff}>
              Odpisz
            </Button>
          ) : null}
          {batch.canDelete ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={onDelete}
              aria-label={`Usuń partię: ${productName}`}
            >
              Usuń partię
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
