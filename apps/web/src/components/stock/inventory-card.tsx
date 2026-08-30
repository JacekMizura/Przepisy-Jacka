"use client";

import {
  Calendar,
  Check,
  MapPin,
  MoreVertical,
  Package,
  Scale,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { ProductCategoryBadge } from "@/components/product-entry/product-category-selector";
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

function productImageUrl(product: StockProductListItem): string | null {
  const url = product.imageUrl ?? null;
  return isDisplayableUrl(url) ? url : null;
}

function expiryStatus(
  product: Pick<
    StockProductListItem,
    "nearestExpiry" | "expiringBatchCount" | "batches"
  >,
): "good" | "warning" | "critical" {
  const tone = expiryTone(
    product.nearestExpiry ?? null,
    product.expiringBatchCount,
  );
  if (tone === "expired") {
    return "critical";
  }
  if (tone === "expiring") {
    return "warning";
  }
  const hasExpiredBatch = (product.batches ?? []).some(
    (batch) => batch.isExpired,
  );
  return hasExpiredBatch ? "critical" : "good";
}

function formatExpiryDate(value: string): string {
  return new Date(value).toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function latestBatchCost(product: StockProductListItem): string | null {
  const withPrice = [...(product.batches ?? [])]
    .filter((batch) => batch.purchasePriceMinor != null)
    .sort((a, b) => {
      const aAt = a.purchasedAt ?? a.createdAt;
      const bAt = b.purchasedAt ?? b.createdAt;
      return new Date(bAt).getTime() - new Date(aAt).getTime();
    });
  const batch = withPrice[0];
  return batch ? formatBatchPricePresentation(batch) : null;
}

type InventoryProductCardProps = {
  kitchenId: string;
  product: StockProductListItem;
  onConsume: () => void;
  onPreviewImage?: (src: string, alt: string) => void;
  menuItems: ProductActionItem[];
};

export function InventoryProductCard({
  kitchenId,
  product,
  onConsume,
  onPreviewImage,
  menuItems,
}: InventoryProductCardProps) {
  const image = productImageUrl(product);
  const status = expiryStatus(product);
  const { amount, unit } = splitDisplayQuantity(
    product.totalQuantity,
    product.defaultUnit,
  );
  const brand =
    [product.brand?.trim(), product.variantLabel?.trim()]
      .filter(Boolean)
      .join(" · ") || null;
  const location = product.primaryLocation
    ? (LOCATION_LABELS[product.primaryLocation] ?? product.primaryLocation)
    : "—";
  const hasExpiry = Boolean(product.nearestExpiry);
  const cost = latestBatchCost(product);
  const addBatchHref = `/kitchens/${kitchenId}/products/${product.productId}/add-batch`;

  return (
    <article
      className="group relative flex gap-3 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:gap-4 sm:p-4"
      data-testid="stock-inventory-card"
      data-product-id={product.productId}
    >
      <button
        type="button"
        className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl sm:h-32 sm:w-32"
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
            className="h-full w-full object-contain p-1.5 transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-zinc-50 text-zinc-300">
            <Package size={32} aria-hidden />
          </span>
        )}
        {status === "warning" || status === "critical" ? (
          <span
            className={cn(
              "absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-black text-white shadow",
              status === "critical" ? "bg-red-600" : "bg-amber-500",
            )}
          >
            {status === "critical" ? "!" : "Termin"}
          </span>
        ) : null}
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-1 flex items-start justify-between gap-2">
          <ProductCategoryBadge category={product.category} variant="pill" />
          <ProductActionsMenu
            label={`Akcje: ${product.productName}`}
            items={menuItems}
            triggerClassName="shrink-0 text-zinc-400 hover:text-zinc-800"
            icon={<MoreVertical size={18} />}
          />
        </div>
        <h3 className="text-base leading-tight font-bold text-zinc-900 sm:text-lg">
          {product.productName}
        </h3>
        {brand ? (
          <p className="mt-0.5 text-xs font-medium text-zinc-500">{brand}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className="inline-flex items-baseline gap-1 text-zinc-900">
            <Scale size={14} className="relative top-0.5 text-zinc-400" aria-hidden />
            <span className="text-lg font-extrabold tabular-nums sm:text-xl">
              {amount}
            </span>
            {unit ? (
              <span className="text-sm font-semibold text-zinc-500">{unit}</span>
            ) : null}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600">
            <MapPin size={13} className="text-zinc-400" aria-hidden />
            {location}
          </span>
          {hasExpiry ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-sm font-medium",
                status === "critical"
                  ? "text-red-600"
                  : status === "warning"
                    ? "text-amber-600"
                    : "text-zinc-600",
              )}
            >
              <Calendar size={13} aria-hidden />
              {formatExpiryDate(product.nearestExpiry!)}
            </span>
          ) : null}
          {cost ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600">
              <Wallet size={13} className="text-zinc-400" aria-hidden />
              {cost}
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex gap-2 pt-3">
          <button
            type="button"
            className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
            onClick={onConsume}
          >
            Zużyj
          </button>
          <Link
            href={addBatchHref}
            className="flex-1 rounded-xl border border-zinc-200 bg-white py-2 text-center text-sm font-bold text-zinc-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
          >
            Dodaj partię
          </Link>
        </div>
      </div>
    </article>
  );
}

type InventoryGroupCardProps = {
  kitchenId: string;
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
  kitchenId,
  group,
  onConsumeVariant,
  onPreviewImage,
  buildMenuItems,
}: InventoryGroupCardProps) {
  const { amount, unit } = splitDisplayQuantity(
    group.totalQuantity,
    group.defaultUnit,
  );
  const status = expiryStatus({
    nearestExpiry: group.nearestExpiry,
    expiringBatchCount: group.expiringBatchCount,
    batches: group.variants.flatMap((variant) => variant.batches ?? []),
  });
  const location = group.primaryLocation
    ? (LOCATION_LABELS[group.primaryLocation] ?? group.primaryLocation)
    : "—";
  const hasExpiry = Boolean(group.nearestExpiry);
  const cover = group.variants.map(productImageUrl).find(Boolean) ?? null;
  const category = group.variants.find((v) => v.category)?.category ?? null;

  return (
    <article
      className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4"
      data-testid="stock-group-card"
      data-group-id={group.groupId}
    >
      <div className="flex gap-3 sm:gap-4">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl sm:h-32 sm:w-32">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="h-full w-full object-contain p-1.5"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-zinc-50 text-zinc-300">
              <Package size={32} aria-hidden />
            </span>
          )}
          {status === "warning" || status === "critical" ? (
            <span
              className={cn(
                "absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-black text-white shadow",
                status === "critical" ? "bg-red-600" : "bg-amber-500",
              )}
            >
              {status === "critical" ? "!" : "Termin"}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <ProductCategoryBadge category={category} variant="pill" />
          <h3 className="mt-1 text-base leading-tight font-bold text-zinc-900 sm:text-lg">
            {group.groupName}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-zinc-500">
            {group.variantCount}{" "}
            {group.variantCount === 1 ? "wariant" : "warianty"}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1 font-bold text-zinc-900">
              <Scale size={13} className="text-zinc-400" aria-hidden />
              {amount}
              {unit ? (
                <span className="font-semibold text-zinc-500">{unit}</span>
              ) : null}
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-zinc-600">
              <MapPin size={13} className="text-zinc-400" aria-hidden />
              {location}
            </span>
            {hasExpiry ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-medium",
                  status === "critical"
                    ? "text-red-600"
                    : status === "warning"
                      ? "text-amber-600"
                      : "text-zinc-600",
                )}
              >
                <Calendar size={13} aria-hidden />
                {formatExpiryDate(group.nearestExpiry!)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-zinc-100 pt-3">
        <p className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
          Warianty
        </p>
        {group.variants.map((variant) => (
          <VariantRow
            key={variant.productId}
            kitchenId={kitchenId}
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
    </article>
  );
}

function VariantRow({
  kitchenId,
  variant,
  onConsume,
  onPreviewImage,
  menuItems,
}: {
  kitchenId: string;
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
    <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50/80 p-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          className="h-11 w-11 shrink-0 overflow-hidden rounded-lg"
          disabled={!image || !onPreviewImage}
          onClick={() => {
            if (image && onPreviewImage) {
              onPreviewImage(image, variant.productName);
            }
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="h-full w-full object-contain p-0.5"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-white text-zinc-300">
              <Package size={16} aria-hidden />
            </span>
          )}
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-800">
            {variant.productName}
          </p>
          {variant.variantLabel ? (
            <p className="truncate text-xs text-zinc-400">
              {variant.variantLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="text-right">
          <span className="text-sm font-bold text-zinc-800">{amount}</span>
          {unit ? (
            <span className="ml-0.5 text-xs text-zinc-500">{unit}</span>
          ) : null}
        </div>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm hover:bg-emerald-50"
          aria-label={`Zużyj ${variant.productName}`}
          onClick={onConsume}
        >
          <Check size={14} />
        </button>
        <Link
          href={`/kitchens/${kitchenId}/products/${variant.productId}/add-batch`}
          className="hidden h-8 items-center rounded-lg bg-white px-2 text-[11px] font-bold text-zinc-700 shadow-sm sm:inline-flex"
        >
          Partia
        </Link>
        <ProductActionsMenu
          label={`Akcje: ${variant.productName}`}
          items={menuItems}
          triggerClassName="h-8 w-8 rounded-lg bg-white p-0 text-zinc-400 shadow-sm"
          icon={<MoreVertical size={14} />}
        />
      </div>
    </div>
  );
}
