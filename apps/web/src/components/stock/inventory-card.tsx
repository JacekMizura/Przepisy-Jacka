"use client";

import {
  AlertCircle,
  Calendar,
  Check,
  MapPin,
  MoreVertical,
  Package,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  ProductActionsMenu,
  type ProductActionItem,
} from "@/components/stock/product-actions-menu";
import { expiryTone } from "@/components/stock/stock-product-row";
import { LOCATION_LABELS } from "@/lib/errors";
import { splitDisplayQuantity } from "@/lib/format-quantity";
import { isDisplayableUrl } from "@/lib/media-upload";
import type {
  StockGroupListItem,
  StockProductListItem,
} from "@/lib/stock-list-types";
import { formatBatchPricePresentation } from "@/lib/stock-package-display";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_BATCHES = 2;

function useFineHover(): boolean {
  const [fineHover, setFineHover] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setFineHover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fineHover;
}

function productImageUrl(product: StockProductListItem): string | null {
  const url = product.imageUrl ?? null;
  return isDisplayableUrl(url) ? url : null;
}

function batchWarning(product: StockProductListItem): boolean {
  return (
    expiryTone(product.nearestExpiry ?? null, product.expiringBatchCount) !==
    "none"
  );
}

type InventoryProductCardProps = {
  product: StockProductListItem;
  onConsume: () => void;
  onPreviewImage?: (src: string, alt: string) => void;
  menuItems: ProductActionItem[];
};

export function InventoryProductCard({
  product,
  onConsume,
  onPreviewImage,
  menuItems,
}: InventoryProductCardProps) {
  const fineHover = useFineHover();
  const [showAllBatches, setShowAllBatches] = useState(false);
  const image = productImageUrl(product);
  const warning = batchWarning(product);
  const { amount, unit } = splitDisplayQuantity(
    product.totalQuantity,
    product.defaultUnit,
  );
  const brand = product.brand?.trim() || null;
  const subtitle = product.variantLabel?.trim() || null;
  const batches = product.batches ?? [];
  const visibleBatches = showAllBatches
    ? batches
    : batches.slice(0, MAX_VISIBLE_BATCHES);
  const hiddenCount = Math.max(0, batches.length - MAX_VISIBLE_BATCHES);

  return (
    <article
      className="group relative flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      data-testid="stock-inventory-card"
      data-product-id={product.productId}
    >
      {warning ? (
        <div
          className={cn(
            "absolute top-4 right-4 rounded-full bg-amber-50 p-1.5 text-amber-500",
            fineHover && "group-hover:opacity-0 group-focus-within:opacity-0",
          )}
          title="Zbliża się termin przydatności"
        >
          <AlertCircle size={16} aria-hidden />
          <span className="sr-only">Zbliża się termin przydatności</span>
        </div>
      ) : null}

      <div
        className={cn(
          "absolute top-4 right-4 z-10 flex gap-2 transition-opacity",
          fineHover
            ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            : "opacity-100",
        )}
      >
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-600 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50"
          onClick={onConsume}
        >
          Zużyj
        </button>
        <ProductActionsMenu
          label={`Akcje: ${product.productName}`}
          items={menuItems}
          triggerClassName="h-auto w-auto rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 shadow-sm hover:bg-slate-50 hover:text-slate-600"
          icon={<MoreVertical size={16} />}
        />
      </div>

      <div className="mb-4 flex gap-4">
        <button
          type="button"
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-2"
          disabled={!image || !onPreviewImage}
          onClick={() => {
            if (image && onPreviewImage) {
              onPreviewImage(image, product.productName);
            }
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="h-full w-full object-contain drop-shadow-sm"
            />
          ) : (
            <Package size={28} className="text-slate-300" aria-hidden />
          )}
        </button>

        <div className="min-w-0 flex-1 pt-1">
          {brand ? (
            <p className="mb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              {brand}
            </p>
          ) : null}
          <h3 className="text-lg leading-tight font-bold text-slate-800">
            {product.productName}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
          ) : null}
          <div className="mt-3 flex items-end gap-1">
            <span className="text-2xl leading-none font-black text-emerald-600">
              {amount}
            </span>
            <span className="mb-0.5 text-sm font-semibold text-emerald-600/70">
              {unit}
            </span>
          </div>
        </div>
      </div>

      {batches.length > 0 ? (
        <div className="mt-auto space-y-2 border-t border-slate-50 pt-4">
          {visibleBatches.map((batch) => (
            <BatchSnippet
              key={batch.id}
              batch={batch}
              warn={batch.isExpired || (warning && Boolean(batch.expiresAt))}
            />
          ))}
          {hiddenCount > 0 && !showAllBatches ? (
            <button
              type="button"
              className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              onClick={() => setShowAllBatches(true)}
            >
              Pokaż wszystkie partie ({batches.length})
            </button>
          ) : null}
          {showAllBatches && hiddenCount > 0 ? (
            <button
              type="button"
              className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              onClick={() => setShowAllBatches(false)}
            >
              Zwiń partie
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function BatchSnippet({
  batch,
  warn,
}: {
  batch: StockProductListItem["batches"][number];
  warn: boolean;
}) {
  const location = LOCATION_LABELS[batch.location] ?? batch.location;
  const price = formatBatchPricePresentation(batch);
  const store = batch.storeName?.trim() || null;
  const dateLabel = batch.expiresAt
    ? new Date(batch.expiresAt).toLocaleDateString("pl-PL", {
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <div className="flex flex-col gap-1 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-medium">
          <MapPin size={12} className="text-slate-400" aria-hidden />
          {location}
        </div>
        {dateLabel ? (
          <div
            className={cn(
              "flex items-center gap-1.5",
              warn && "font-semibold text-amber-600",
            )}
          >
            <Calendar size={12} aria-hidden />
            {dateLabel}
          </div>
        ) : null}
      </div>
      {store || price ? (
        <div className="mt-1 text-[10px] text-slate-400">
          {[store, price].filter(Boolean).join(" • ")}
        </div>
      ) : null}
    </div>
  );
}

type InventoryGroupCardProps = {
  group: StockGroupListItem;
  onConsumeVariant: (product: StockProductListItem) => void;
  onPreviewImage?: (src: string, alt: string) => void;
  buildMenuItems: (args: {
    productId: string;
    productName: string;
    summary: StockProductListItem;
  }) => ProductActionItem[];
};

export function InventoryGroupCard({
  group,
  onConsumeVariant,
  onPreviewImage,
  buildMenuItems,
}: InventoryGroupCardProps) {
  const { amount, unit } = splitDisplayQuantity(
    group.totalQuantity,
    group.defaultUnit,
  );
  const warning =
    expiryTone(group.nearestExpiry, group.expiringBatchCount) !== "none";

  return (
    <article
      className="group relative flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      data-testid="stock-group-card"
      data-group-id={group.groupId}
    >
      {warning ? (
        <div
          className="absolute top-4 right-4 rounded-full bg-amber-50 p-1.5 text-amber-500"
          title="Zbliża się termin przydatności"
        >
          <AlertCircle size={16} aria-hidden />
        </div>
      ) : null}

      <div className="mb-4 flex gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 p-2">
          <Package size={32} className="text-slate-300" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <h3 className="text-lg leading-tight font-bold text-slate-800">
            {group.groupName}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {group.variantCount}{" "}
            {group.variantCount === 1 ? "wariant" : "warianty"}
          </p>
          <div className="mt-3 flex items-end gap-1">
            <span className="text-2xl leading-none font-black text-emerald-600">
              {amount}
            </span>
            <span className="mb-0.5 text-sm font-semibold text-emerald-600/70">
              {unit}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-slate-50 pt-4">
        <p className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
          Warianty ({group.variants.length})
        </p>
        <div className="space-y-1">
          {group.variants.map((variant) => (
            <VariantRow
              key={variant.productId}
              variant={variant}
              onConsume={() => onConsumeVariant(variant)}
              onPreviewImage={onPreviewImage}
              menuItems={buildMenuItems({
                productId: variant.productId,
                productName: variant.productName,
                summary: variant,
              })}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function VariantRow({
  variant,
  onConsume,
  onPreviewImage,
  menuItems,
}: {
  variant: StockProductListItem;
  onConsume: () => void;
  onPreviewImage?: (src: string, alt: string) => void;
  menuItems: ProductActionItem[];
}) {
  const image = productImageUrl(variant);
  const { amount, unit } = splitDisplayQuantity(
    variant.totalQuantity,
    variant.defaultUnit,
  );

  return (
    <div className="mb-2 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 p-3 transition-all hover:bg-white hover:shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white"
          disabled={!image || !onPreviewImage}
          onClick={() => {
            if (image && onPreviewImage) {
              onPreviewImage(image, variant.productName);
            }
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-5 w-5 object-contain" />
          ) : (
            <Package size={12} className="text-slate-300" aria-hidden />
          )}
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-700">
            {variant.productName}
          </p>
          {variant.variantLabel ? (
            <p className="truncate text-xs text-slate-400">
              {variant.variantLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="text-right">
          <span className="text-sm font-bold text-slate-800">{amount}</span>
          {unit ? (
            <span className="ml-1 text-xs text-slate-500">{unit}</span>
          ) : null}
        </div>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-emerald-600 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50"
          aria-label={`Zużyj ${variant.productName}`}
          onClick={onConsume}
        >
          <Check size={14} />
        </button>
        <ProductActionsMenu
          label={`Akcje: ${variant.productName}`}
          items={menuItems}
          triggerClassName="h-8 w-8 rounded-lg border border-slate-200 bg-white p-0 text-slate-400 shadow-sm hover:bg-slate-50"
          icon={<MoreVertical size={14} />}
        />
      </div>
    </div>
  );
}
