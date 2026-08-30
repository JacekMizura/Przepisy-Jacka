"use client";

import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
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
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      data-testid="stock-inventory-card"
      data-product-id={product.productId}
    >
      <div className="relative h-28 w-full overflow-hidden bg-zinc-50/80">
        <button
          type="button"
          className="flex h-full w-full items-center justify-center p-3"
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
              className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <Package size={36} className="text-zinc-300" aria-hidden />
          )}
        </button>

        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
          {status === "warning" ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2 py-1 text-[10px] font-black text-white shadow">
              <Clock size={11} aria-hidden /> TERMIN
            </span>
          ) : null}
          {status === "critical" ? (
            <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white shadow">
              <AlertCircle size={11} aria-hidden /> PRZETERMINOWANE
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <ProductCategoryBadge
            category={product.category}
            variant="pill"
          />
          <ProductActionsMenu
            label={`Akcje: ${product.productName}`}
            items={menuItems}
            triggerClassName="shrink-0 text-zinc-400 transition-colors hover:text-zinc-800"
            icon={<MoreVertical size={18} />}
          />
        </div>
        <h3 className="text-base leading-tight font-bold text-zinc-900">
          {product.productName}
        </h3>
        {brand ? (
          <p className="mt-0.5 text-xs font-medium text-zinc-500">{brand}</p>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-3">
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
              <Scale size={11} aria-hidden /> Stan
            </p>
            <p className="text-sm font-bold text-zinc-900">
              {amount}
              {unit ? (
                <span className="ml-1 text-xs font-semibold text-zinc-500">
                  {unit}
                </span>
              ) : null}
            </p>
          </div>
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
              <MapPin size={11} aria-hidden /> Miejsce
            </p>
            <p className="text-sm font-semibold text-zinc-700">{location}</p>
          </div>
          {hasExpiry ? (
            <div className="col-span-2 border-t border-zinc-200/80 pt-2">
              <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                <Calendar size={11} aria-hidden /> Data ważności
              </p>
              <p
                className={cn(
                  "text-sm font-semibold",
                  status === "critical"
                    ? "text-red-600"
                    : status === "warning"
                      ? "text-amber-600"
                      : "text-zinc-700",
                )}
              >
                {formatExpiryDate(product.nearestExpiry!)}
              </p>
            </div>
          ) : null}
          {cost ? (
            <div
              className={cn(
                "col-span-2",
                hasExpiry ? "pt-0" : "border-t border-zinc-200/80 pt-2",
              )}
            >
              <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                <Wallet size={11} aria-hidden /> Koszt
              </p>
              <p className="text-sm font-semibold text-zinc-700">{cost}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-auto flex gap-2 pt-3">
          <button
            type="button"
            className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
            onClick={onConsume}
          >
            Zużyj
          </button>
          <Link
            href={addBatchHref}
            className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-center text-sm font-bold text-zinc-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
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
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      data-testid="stock-group-card"
      data-group-id={group.groupId}
    >
      <div className="relative h-28 w-full overflow-hidden bg-zinc-50/80">
        <div className="flex h-full w-full items-center justify-center p-3">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <Package size={36} className="text-zinc-300" aria-hidden />
          )}
        </div>
        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
          {status === "warning" ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2 py-1 text-[10px] font-black text-white shadow">
              <Clock size={11} aria-hidden /> TERMIN
            </span>
          ) : null}
          {status === "critical" ? (
            <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white shadow">
              <AlertCircle size={11} aria-hidden /> PRZETERMINOWANE
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2">
          <ProductCategoryBadge category={category} variant="pill" />
        </div>
        <h3 className="text-base leading-tight font-bold text-zinc-900">
          {group.groupName}
        </h3>
        <p className="mt-0.5 text-xs font-medium text-zinc-500">
          {group.variantCount}{" "}
          {group.variantCount === 1 ? "wariant" : "warianty"}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-3">
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
              <Scale size={11} aria-hidden /> Stan
            </p>
            <p className="text-sm font-bold text-zinc-900">
              {amount}
              {unit ? (
                <span className="ml-1 text-xs font-semibold text-zinc-500">
                  {unit}
                </span>
              ) : null}
            </p>
          </div>
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
              <MapPin size={11} aria-hidden /> Miejsce
            </p>
            <p className="text-sm font-semibold text-zinc-700">{location}</p>
          </div>
          {hasExpiry ? (
            <div className="col-span-2 border-t border-zinc-200/80 pt-2">
              <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                <Calendar size={11} aria-hidden /> Data ważności
              </p>
              <p
                className={cn(
                  "text-sm font-semibold",
                  status === "critical"
                    ? "text-red-600"
                    : status === "warning"
                      ? "text-amber-600"
                      : "text-zinc-700",
                )}
              >
                {formatExpiryDate(group.nearestExpiry!)}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-3 space-y-2">
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
    <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50/90 p-2.5 transition-colors hover:bg-white hover:shadow-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white"
          disabled={!image || !onPreviewImage}
          onClick={() => {
            if (image && onPreviewImage) {
              onPreviewImage(image, variant.productName);
            }
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="max-h-full max-w-full object-contain p-1" />
          ) : (
            <Package size={14} className="text-zinc-300" aria-hidden />
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
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm transition-colors hover:bg-emerald-50"
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
          triggerClassName="h-8 w-8 rounded-lg bg-white p-0 text-zinc-400 shadow-sm hover:bg-zinc-50"
          icon={<MoreVertical size={14} />}
        />
      </div>
    </div>
  );
}
