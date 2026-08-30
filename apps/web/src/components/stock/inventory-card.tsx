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
} from "lucide-react";
import Link from "next/link";

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

function formatExpiryDate(value: string | null | undefined): string {
  if (!value) {
    return "Brak daty";
  }
  return new Date(value).toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
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
  const category = product.category?.trim() || "Bez kategorii";
  const location = product.primaryLocation
    ? (LOCATION_LABELS[product.primaryLocation] ?? product.primaryLocation)
    : "—";
  const addBatchHref = `/kitchens/${kitchenId}/products/${product.productId}/add-batch`;

  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      data-testid="stock-inventory-card"
      data-product-id={product.productId}
    >
      <div className="relative h-48 w-full overflow-hidden bg-zinc-100">
        <button
          type="button"
          className="h-full w-full"
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
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-zinc-300">
              <Package size={48} aria-hidden />
            </span>
          )}
        </button>

        <div className="absolute top-4 right-4 flex flex-col gap-2">
          {status === "warning" ? (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-black text-white shadow-lg backdrop-blur-md">
              <Clock size={12} aria-hidden /> ZBLIŻA SIĘ TERMIN
            </span>
          ) : null}
          {status === "critical" ? (
            <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-black text-white shadow-lg backdrop-blur-md">
              <AlertCircle size={12} aria-hidden /> PRZETERMINOWANE!
            </span>
          ) : null}
        </div>
      </div>

      <div className="p-6 pb-0">
        <div className="mb-1 flex items-start justify-between gap-2">
          <p className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
            {category}
          </p>
          <ProductActionsMenu
            label={`Akcje: ${product.productName}`}
            items={menuItems}
            triggerClassName="text-zinc-400 transition-colors hover:text-zinc-900"
            icon={<MoreVertical size={20} />}
          />
        </div>
        <h3 className="mb-1 text-xl leading-tight font-black text-zinc-900">
          {product.productName}
        </h3>
        {brand ? (
          <p className="text-sm font-semibold text-zinc-500">{brand}</p>
        ) : null}
      </div>

      <div className="mt-auto p-6">
        <div className="mb-6 grid grid-cols-2 gap-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] font-black tracking-wider text-zinc-400 uppercase">
              <Scale size={12} aria-hidden /> STAN
            </p>
            <p className="text-lg font-black text-zinc-900">
              {amount}{" "}
              <span className="text-sm font-semibold text-zinc-500">{unit}</span>
            </p>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] font-black tracking-wider text-zinc-400 uppercase">
              <MapPin size={12} aria-hidden /> MIEJSCE
            </p>
            <p className="text-sm font-bold text-zinc-700">{location}</p>
          </div>
          <div className="col-span-2 mt-1 border-t border-zinc-200 pt-3">
            <p className="mb-1 flex items-center gap-1 text-[10px] font-black tracking-wider text-zinc-400 uppercase">
              <Calendar size={12} aria-hidden /> DATA WAŻNOŚCI
            </p>
            <p
              className={cn(
                "text-sm font-bold",
                status === "critical"
                  ? "text-red-600"
                  : status === "warning"
                    ? "text-amber-600"
                    : "text-zinc-700",
              )}
            >
              {formatExpiryDate(product.nearestExpiry)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-zinc-800"
            onClick={onConsume}
          >
            Zużyj
          </button>
          <Link
            href={addBatchHref}
            className="flex-1 rounded-xl border-2 border-zinc-200 bg-white py-3 text-center text-sm font-bold text-zinc-900 transition-colors hover:border-zinc-900"
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
  const cover = group.variants.map(productImageUrl).find(Boolean) ?? null;

  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      data-testid="stock-group-card"
      data-group-id={group.groupId}
    >
      <div className="relative h-48 w-full overflow-hidden bg-zinc-100">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-zinc-300">
            <Package size={48} aria-hidden />
          </span>
        )}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          {status === "warning" ? (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-black text-white shadow-lg">
              <Clock size={12} aria-hidden /> ZBLIŻA SIĘ TERMIN
            </span>
          ) : null}
          {status === "critical" ? (
            <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-black text-white shadow-lg">
              <AlertCircle size={12} aria-hidden /> PRZETERMINOWANE!
            </span>
          ) : null}
        </div>
      </div>

      <div className="p-6 pb-0">
        <p className="mb-1 text-xs font-bold tracking-wider text-zinc-400 uppercase">
          Rodzaj · {group.variantCount}{" "}
          {group.variantCount === 1 ? "wariant" : "warianty"}
        </p>
        <h3 className="mb-1 text-xl leading-tight font-black text-zinc-900">
          {group.groupName}
        </h3>
      </div>

      <div className="mt-auto space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] font-black tracking-wider text-zinc-400 uppercase">
              <Scale size={12} aria-hidden /> STAN
            </p>
            <p className="text-lg font-black text-zinc-900">
              {amount}{" "}
              <span className="text-sm font-semibold text-zinc-500">{unit}</span>
            </p>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] font-black tracking-wider text-zinc-400 uppercase">
              <MapPin size={12} aria-hidden /> MIEJSCE
            </p>
            <p className="text-sm font-bold text-zinc-700">{location}</p>
          </div>
          <div className="col-span-2 mt-1 border-t border-zinc-200 pt-3">
            <p className="mb-1 flex items-center gap-1 text-[10px] font-black tracking-wider text-zinc-400 uppercase">
              <Calendar size={12} aria-hidden /> DATA WAŻNOŚCI
            </p>
            <p
              className={cn(
                "text-sm font-bold",
                status === "critical"
                  ? "text-red-600"
                  : status === "warning"
                    ? "text-amber-600"
                    : "text-zinc-700",
              )}
            >
              {formatExpiryDate(group.nearestExpiry)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-black tracking-wider text-zinc-400 uppercase">
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
    <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 transition-all hover:bg-white hover:shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-white"
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
            <Package size={12} className="text-zinc-300" aria-hidden />
          )}
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-700">
            {variant.productName}
          </p>
          {variant.variantLabel ? (
            <p className="truncate text-xs text-zinc-400">
              {variant.variantLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <span className="text-sm font-bold text-zinc-800">{amount}</span>
          {unit ? (
            <span className="ml-1 text-xs text-zinc-500">{unit}</span>
          ) : null}
        </div>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-emerald-600 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50"
          aria-label={`Zużyj ${variant.productName}`}
          onClick={onConsume}
        >
          <Check size={14} />
        </button>
        <Link
          href={`/kitchens/${kitchenId}/products/${variant.productId}/add-batch`}
          className="hidden h-8 items-center rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-bold text-zinc-700 sm:inline-flex"
        >
          Partia
        </Link>
        <ProductActionsMenu
          label={`Akcje: ${variant.productName}`}
          items={menuItems}
          triggerClassName="h-8 w-8 rounded-lg border border-zinc-200 bg-white p-0 text-zinc-400 shadow-sm hover:bg-zinc-50"
          icon={<MoreVertical size={14} />}
        />
      </div>
    </div>
  );
}
