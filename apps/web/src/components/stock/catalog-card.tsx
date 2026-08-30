"use client";

import { ArrowRight, MoreVertical, Package, Tag } from "lucide-react";
import Link from "next/link";

import {
  ProductActionsMenu,
  type ProductActionItem,
} from "@/components/stock/product-actions-menu";
import { UNIT_LABELS } from "@/lib/errors";
import { isDisplayableUrl, mediaDisplayUrl } from "@/lib/media-upload";
import type { components } from "@moja-kuchnia/api-client";

type CatalogProduct = components["schemas"]["CatalogProductDto"];

function productImageUrl(product: CatalogProduct): string | null {
  return (
    mediaDisplayUrl(product.image, "thumbnail") ??
    (isDisplayableUrl(product.imageUrl) ? product.imageUrl : null)
  );
}

type CatalogProductRowProps = {
  kitchenId: string;
  product: CatalogProduct;
  menuItems: ProductActionItem[];
  onPreview?: (src: string, alt: string) => void;
};

export function CatalogProductRow({
  kitchenId,
  product,
  menuItems,
  onPreview,
}: CatalogProductRowProps) {
  const image = productImageUrl(product);
  const brand =
    [product.brand?.trim(), product.variantLabel?.trim()]
      .filter(Boolean)
      .join(" · ") || null;
  const category = product.category?.trim() || "Bez kategorii";
  const addBatchHref = `/kitchens/${kitchenId}/products/${product.id}/add-batch`;

  return (
    <div
      className="group grid grid-cols-1 items-center gap-4 p-4 transition-colors hover:bg-zinc-50 sm:grid-cols-12"
      data-testid="catalog-product-card"
      data-product-id={product.id}
    >
      <div className="flex items-center gap-4 sm:col-span-5 sm:pl-4">
        <button
          type="button"
          className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-sm"
          disabled={!image || !onPreview}
          onClick={() => {
            if (image && onPreview) {
              onPreview(image, product.name);
            }
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-zinc-300">
              <Package size={22} aria-hidden />
            </span>
          )}
        </button>
        <div className="min-w-0">
          <h4 className="truncate text-lg font-bold text-zinc-900">
            {product.name}
          </h4>
          {brand ? (
            <p className="truncate text-sm font-medium text-zinc-500">{brand}</p>
          ) : null}
        </div>
      </div>

      <div className="sm:col-span-2">
        <span className="rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-700">
          {category}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm font-medium text-zinc-600 sm:col-span-2">
        <Tag size={14} className="shrink-0 text-zinc-400" aria-hidden />
        <span className="truncate">{product.ean ?? "—"}</span>
      </div>

      <div className="font-bold text-zinc-900 sm:col-span-2">
        {UNIT_LABELS[product.defaultUnit]}
      </div>

      <div className="flex justify-end gap-2 sm:col-span-1 sm:pr-4 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
        <Link
          href={addBatchHref}
          className="rounded-lg border border-transparent p-2 text-zinc-500 transition-all hover:border-zinc-200 hover:bg-white hover:text-emerald-600"
          title="Dodaj do zapasów"
        >
          <ArrowRight size={18} />
        </Link>
        <ProductActionsMenu
          label={`Akcje: ${product.name}`}
          items={menuItems}
          triggerClassName="rounded-lg border border-transparent p-2 text-zinc-500 transition-all hover:border-zinc-200 hover:bg-white hover:text-zinc-900"
          icon={<MoreVertical size={18} />}
        />
      </div>
    </div>
  );
}

/** @deprecated Prefer CatalogProductRow — retained name for older imports. */
export function CatalogProductCard(props: CatalogProductRowProps) {
  return <CatalogProductRow {...props} />;
}

type CatalogGroupRowProps = {
  kitchenId: string;
  groupId: string;
  groupName: string;
  variantCount: number;
  category?: string | null;
};

export function CatalogGroupCard({
  kitchenId,
  groupId,
  groupName,
  variantCount,
  category,
}: CatalogGroupRowProps) {
  return (
    <div
      className="grid grid-cols-1 items-center gap-4 p-4 transition-colors hover:bg-zinc-50 sm:grid-cols-12"
      data-testid="catalog-group-card"
      data-group-id={groupId}
    >
      <div className="flex items-center gap-4 sm:col-span-5 sm:pl-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50">
          <Package size={22} className="text-zinc-300" aria-hidden />
        </div>
        <div className="min-w-0">
          <h4 className="truncate text-lg font-bold text-zinc-900">
            {groupName}
          </h4>
          <p className="text-sm font-medium text-zinc-500">
            {variantCount} {variantCount === 1 ? "wariant" : "warianty"}
          </p>
        </div>
      </div>
      <div className="sm:col-span-2">
        <span className="rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-700">
          {category?.trim() || "Rodzaj"}
        </span>
      </div>
      <div className="text-sm font-medium text-zinc-500 sm:col-span-2">—</div>
      <div className="font-bold text-zinc-900 sm:col-span-2">—</div>
      <div className="flex justify-end sm:col-span-1 sm:pr-4">
        <Link
          href={`/kitchens/${kitchenId}/product-groups/${groupId}`}
          className="rounded-lg border border-transparent p-2 text-zinc-500 transition-all hover:border-zinc-200 hover:bg-white hover:text-emerald-600"
          title="Otwórz rodzaj"
        >
          <ArrowRight size={18} />
        </Link>
      </div>
    </div>
  );
}
