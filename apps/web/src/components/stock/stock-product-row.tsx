"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ChevronDown, Package } from "lucide-react";

import { ProductCategoryBadge } from "@/components/product-entry/product-category-selector";
import {
  ProductActionsMenu,
  type ProductActionItem,
} from "@/components/stock/product-actions-menu";
import { Button } from "@/components/ui/button";
import { LOCATION_LABELS } from "@/lib/errors";
import { formatDisplayQuantityWithUnit } from "@/lib/format-quantity";
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
  /** Wariant wewnątrz karty rodzaju — bez własnej ramki karty. */
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
  const category = product?.category ?? summary.category;

  return (
    <li className={cn(nested ? "bg-white" : undefined)}>
      <div
        className={cn(
          "grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4",
          nested && "pl-4 sm:pl-5",
          !nested && "min-h-[72px] py-3",
          nested && "min-h-[72px]",
        )}
      >
        <ProductThumb
          thumbnail={images.thumbnail}
          full={images.full}
          alt={summary.productName}
          size={nested ? "sm" : "md"}
          onPreview={onPreviewImage}
        />
        <button
          type="button"
          className="min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold leading-snug text-gray-900 sm:text-[15px]">
              {summary.productName}
            </p>
            {kindBadge ? (
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-100">
                {kindBadge}
              </span>
            ) : null}
            {summary.isArchived ? (
              <span className="text-[11px] font-medium text-amber-700">
                Zarchiwizowany
              </span>
            ) : null}
          </div>
          {meta || category ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-500">
              {meta ? <span className="truncate">{meta}</span> : null}
              {meta && category ? <span aria-hidden>·</span> : null}
              {category ? (
                <ProductCategoryBadge
                  category={category}
                  className="!mt-0 text-[11px] font-normal opacity-90"
                />
              ) : null}
            </p>
          ) : null}
          <p className="mt-0.5 text-xs text-gray-600 sm:text-sm">
            {formatProductStockHeadline({
              totalQuantity: summary.totalQuantity,
              defaultUnit: summary.defaultUnit,
              batchCount: summary.batchCount,
              batches: summary.batches,
            })}
          </p>
          {hint ? (
            <p className="mt-0.5 text-[11px] text-amber-700">{hint}</p>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="amber"
            className="h-8 px-2.5 text-xs sm:text-sm"
            onClick={(event) => {
              event.stopPropagation();
              onConsume();
            }}
          >
            Zużyj
          </Button>
          <div onClick={(event) => event.stopPropagation()}>
            <ProductActionsMenu
              label={`Akcje: ${summary.productName}`}
              items={menuItems}
            />
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Zwiń partie: ${summary.productName}`
                : `Rozwiń partie: ${summary.productName}`
            }
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpanded();
            }}
          >
            <ChevronDown
              size={16}
              className={cn("transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
        </div>
      </div>
      {expanded ? (
        <StockBatchList
          kitchenId={kitchenId}
          summary={summary}
          nested={nested}
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
  size,
  onPreview,
}: {
  thumbnail: string | null;
  full: string | null;
  alt: string;
  size: "sm" | "md";
  onPreview?: (src: string, alt: string) => void;
}) {
  const box =
    size === "sm"
      ? "h-11 w-11 rounded-lg"
      : "h-12 w-12 rounded-xl";

  if (thumbnail && full && onPreview) {
    return (
      <button
        type="button"
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden border border-gray-200 bg-gray-50 transition-shadow hover:shadow-md",
          box,
        )}
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
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden border border-gray-200 bg-gray-50",
        box,
      )}
    >
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć
        <img src={thumbnail} alt="" className="h-full w-full object-contain" />
      ) : (
        <Package size={16} className="text-gray-300" />
      )}
    </div>
  );
}

function StockBatchList({
  kitchenId,
  summary,
  nested,
  onWriteOffBatch,
  onDeleteBatch,
}: {
  kitchenId: string;
  summary: StockSummary;
  nested: boolean;
  onWriteOffBatch: (batchId: string) => void;
  onDeleteBatch: (batch: { id: string; label: string }) => void;
}) {
  return (
    <ul
      className={cn(
        "space-y-1.5 border-t border-gray-100 bg-gray-50/50 px-3 py-2 sm:px-4",
        nested && "pl-4 sm:pl-5",
      )}
    >
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
              label: `${summary.productName} (${formatDisplayQuantityWithUnit(
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
  const storePart = batch.storeName ? batch.storeName : "Ręczne dodanie";
  const purchasePart = batch.purchasedAt
    ? `zakup ${new Date(batch.purchasedAt).toLocaleDateString("pl-PL")}`
    : null;
  const priceLine = formatBatchPricePresentation(batch);
  const location = LOCATION_LABELS[batch.location];
  const isPackagedBatch = batch.packageCount != null && batch.packageCount >= 1;

  const menuItems: ProductActionItem[] = [];
  if (batch.purchaseId) {
    menuItems.push({
      id: "purchase",
      label: "Zobacz zakup / paragon",
      href: `/kitchens/${kitchenId}/purchases/${batch.purchaseId}`,
    });
  }
  menuItems.push({
    id: "writeoff",
    label: "Odpisz",
    onSelect: onWriteOff,
  });
  if (batch.canDelete) {
    menuItems.push({
      id: "delete",
      label: "Usuń partię",
      onSelect: onDelete,
      destructive: true,
    });
  }

  return (
    <li
      className={cn(
        "rounded-md px-2.5 py-2 text-sm",
        batch.isExpired ? "bg-red-50/70" : "bg-white/80",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          {isPackagedBatch ? (
            <>
              <p className="text-[13px] leading-snug text-gray-900">
                <span className="font-medium">
                  {[qty.primary, storePart, purchasePart]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {batch.isExpired ? (
                  <span className="ml-1.5 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-800">
                    Przeterminowane
                  </span>
                ) : null}
              </p>
              {qty.secondary ? (
                <p className="text-[11px] leading-snug text-gray-500">
                  {qty.secondary}
                </p>
              ) : null}
              <p className="text-[11px] leading-snug text-gray-500">
                {[
                  priceLine
                    ? priceLine.charAt(0).toUpperCase() + priceLine.slice(1)
                    : "Cena nieznana",
                  location,
                  batch.expiresAt
                    ? `Ważne do ${new Date(batch.expiresAt).toLocaleDateString("pl-PL")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-medium leading-snug text-gray-900">
                {qty.primary}
                {batch.isExpired ? (
                  <span className="ml-1.5 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-800">
                    Przeterminowane
                  </span>
                ) : null}
              </p>
              {qty.secondary ? (
                <p className="text-[11px] leading-snug text-gray-500">
                  {qty.secondary}
                </p>
              ) : null}
              <p className="text-[11px] leading-snug text-gray-500">
                {[
                  storePart,
                  purchasePart,
                  priceLine,
                  location,
                  batch.expiresAt
                    ? `Ważne do ${new Date(batch.expiresAt).toLocaleDateString("pl-PL")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </>
          )}
          {batch.deleteBlockReason ? (
            <p className="text-[11px] text-gray-500">{batch.deleteBlockReason}</p>
          ) : null}
        </div>
        <div
          className="shrink-0"
          onClick={(event) => event.stopPropagation()}
        >
          <ProductActionsMenu
            label={`Akcje partii: ${productName}`}
            items={menuItems}
          />
        </div>
      </div>
    </li>
  );
}
