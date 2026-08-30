"use client";

import { ChevronDown, Package } from "lucide-react";

import {
  ProductActionsMenu,
  type ProductActionItem,
} from "@/components/stock/product-actions-menu";
import { Button } from "@/components/ui/button";
import { LOCATION_LABELS } from "@/lib/errors";
import {
  formatDisplayQuantityWithUnit,
} from "@/lib/format-quantity";
import { isDisplayableUrl, mediaDisplayUrl } from "@/lib/media-upload";
import type { StockProductListItem } from "@/lib/stock-list-types";
import {
  formatBatchPricePresentation,
  formatBatchQuantityPresentation,
} from "@/lib/stock-package-display";
import { cn } from "@/lib/utils";

type StockBatch = StockProductListItem["batches"][number];

export type ExpiryTone = "expired" | "expiring" | "none";

export function expiryTone(
  nearestExpiry: string | null,
  expiringBatchCount: number,
): ExpiryTone {
  if (!nearestExpiry) {
    return "none";
  }
  const ms = new Date(nearestExpiry).getTime();
  if (!Number.isFinite(ms)) {
    return "none";
  }
  if (ms <= Date.now()) {
    return "expired";
  }
  if (expiringBatchCount > 0 || ms <= Date.now() + 7 * 86400000) {
    return "expiring";
  }
  return "none";
}

export function brandVariantLabel(product: {
  brand?: string | null;
  variantLabel?: string | null;
}): string | null {
  const parts = [product.brand, product.variantLabel].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function productImageFromListItem(product: StockProductListItem): {
  thumbnail: string | null;
  full: string | null;
} {
  const url = product.imageUrl ?? null;
  const legacy = isDisplayableUrl(url) ? url : null;
  return { thumbnail: legacy, full: legacy };
}

type StockProductRowProps = {
  kitchenId: string;
  summary: StockProductListItem;
  kindBadge?: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onConsume: () => void;
  onPreviewImage?: (src: string, alt: string) => void;
  menuItems: ProductActionItem[];
  onWriteOffBatch: (batchId: string) => void;
  onDeleteBatch: (batch: { id: string; label: string }) => void;
  /** Indented variant under a group row. */
  nested?: boolean;
  /** Desktop table vs mobile stacked. */
  layout?: "table" | "mobile";
};

export function StockProductRow({
  kitchenId,
  summary,
  kindBadge,
  expanded,
  onToggleExpanded,
  onConsume,
  onPreviewImage,
  menuItems,
  onWriteOffBatch,
  onDeleteBatch,
  nested = false,
  layout = "table",
}: StockProductRowProps) {
  const images = productImageFromListItem(summary);
  const meta = brandVariantLabel(summary);
  const tone = expiryTone(
    summary.nearestExpiry ?? null,
    summary.expiringBatchCount,
  );
  const place = summary.primaryLocation
    ? LOCATION_LABELS[summary.primaryLocation]
    : "—";
  const qty = formatDisplayQuantityWithUnit(
    summary.totalQuantity,
    summary.defaultUnit,
  );
  const expiryLabel = summary.nearestExpiry
    ? new Date(summary.nearestExpiry).toLocaleDateString("pl-PL")
    : "—";

  if (layout === "mobile") {
    return (
      <li className={cn(nested && "pl-3")}>
        <div className="flex min-h-[64px] items-center gap-2 border-b border-gray-100 px-2 py-2">
          <ProductThumb
            thumbnail={images.thumbnail}
            full={images.full}
            alt={summary.productName}
            size="sm"
            onPreview={onPreviewImage}
          />
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          >
            <div className="flex flex-wrap items-center gap-1">
              <p className="truncate text-sm font-medium text-gray-900">
                {summary.productName}
              </p>
              {kindBadge ? (
                <span className="text-[10px] font-medium text-gray-500">
                  {kindBadge}
                </span>
              ) : null}
            </div>
            {meta ? (
              <p className="truncate text-[11px] text-gray-500">{meta}</p>
            ) : null}
            <p className="mt-0.5 text-xs text-gray-700">
              <span className="font-medium">{qty}</span>
              <span
                className={cn(
                  "ml-1.5",
                  tone === "expired" && "font-medium text-red-700",
                  tone === "expiring" && "font-medium text-orange-700",
                  tone === "none" && "text-gray-500",
                )}
              >
                {expiryLabel}
              </span>
            </p>
          </button>
          <Button
            type="button"
            size="sm"
            variant="amber"
            className="h-8 shrink-0 px-2.5 text-xs"
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

  return (
    <li className={cn(nested && "bg-gray-50/40")}>
      <div
        className={cn(
          "grid min-h-14 grid-cols-[minmax(0,2.2fr)_minmax(4.5rem,0.7fr)_minmax(3.5rem,0.55fr)_minmax(5.5rem,0.85fr)_minmax(5rem,0.75fr)_auto] items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-sm",
          nested && "pl-8",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <ProductThumb
            thumbnail={images.thumbnail}
            full={images.full}
            alt={summary.productName}
            size="sm"
            onPreview={onPreviewImage}
          />
          <button
            type="button"
            className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-medium text-gray-900">
                {summary.productName}
              </span>
              {kindBadge ? (
                <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  {kindBadge}
                </span>
              ) : null}
              {summary.isArchived ? (
                <span className="text-[10px] font-medium text-amber-700">
                  Archiwum
                </span>
              ) : null}
            </div>
            {meta ? (
              <p className="truncate text-[11px] text-gray-500">{meta}</p>
            ) : null}
          </button>
        </div>
        <p className="tabular-nums text-gray-800">{qty}</p>
        <p className="tabular-nums text-gray-600">{summary.batchCount}</p>
        <p
          className={cn(
            "tabular-nums",
            tone === "expired" && "font-medium text-red-700",
            tone === "expiring" && "font-medium text-orange-700",
            tone === "none" && "text-gray-600",
          )}
        >
          {expiryLabel}
        </p>
        <p className="truncate text-gray-600">{place}</p>
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            size="sm"
            variant="amber"
            className="h-7 px-2 text-xs"
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
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
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
              size={15}
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
  const box = size === "sm" ? "h-9 w-9 rounded-md" : "h-11 w-11 rounded-lg";

  if (thumbnail && full && onPreview) {
    return (
      <button
        type="button"
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden border border-gray-200 bg-gray-50",
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
        <Package size={14} className="text-gray-300" />
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
  summary: StockProductListItem;
  nested: boolean;
  onWriteOffBatch: (batchId: string) => void;
  onDeleteBatch: (batch: { id: string; label: string }) => void;
}) {
  return (
    <ul
      className={cn(
        "border-b border-gray-100 bg-gray-50/60",
        nested ? "pl-10" : "pl-4",
      )}
      data-testid="stock-batch-list"
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
  unit: StockProductListItem["defaultUnit"];
  productName: string;
  onWriteOff: () => void;
  onDelete: () => void;
}) {
  const qty = formatBatchQuantityPresentation(batch, unit);
  const storePart = batch.storeName ? batch.storeName : "Ręczne dodanie";
  const purchasePart = batch.purchasedAt
    ? new Date(batch.purchasedAt).toLocaleDateString("pl-PL")
    : null;
  const priceLine = formatBatchPricePresentation(batch);
  const location = LOCATION_LABELS[batch.location];

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
        "flex min-h-11 items-center gap-2 border-t border-gray-100/80 px-2 py-1.5 text-xs",
        batch.isExpired && "text-red-800",
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-[13px] text-gray-900">
          <span className="font-medium">{qty.primary}</span>
          <span className="text-gray-500">
            {" · "}
            {[storePart, purchasePart, location].filter(Boolean).join(" · ")}
          </span>
          {batch.isExpired ? (
            <span className="ml-1.5 font-semibold text-red-700">
              Przeterminowane
            </span>
          ) : null}
        </p>
        <p className="truncate text-[11px] text-gray-500">
          {[
            qty.secondary,
            priceLine,
            batch.expiresAt
              ? `do ${new Date(batch.expiresAt).toLocaleDateString("pl-PL")}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
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
    </li>
  );
}

/** @deprecated Prefer brandVariantLabel / productImageFromListItem */
export function productImageUrls(product: {
  imageUrl?: string | null;
  image?: Parameters<typeof mediaDisplayUrl>[0];
}): { thumbnail: string | null; full: string | null } {
  const legacy = isDisplayableUrl(product.imageUrl) ? product.imageUrl! : null;
  return {
    thumbnail: mediaDisplayUrl(product.image, "thumbnail") ?? legacy,
    full: mediaDisplayUrl(product.image) ?? legacy,
  };
}

/** @deprecated */
export function expiryHint(summary: {
  expiringBatchCount: number;
  nearestExpiry: string | null;
}): string | null {
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
