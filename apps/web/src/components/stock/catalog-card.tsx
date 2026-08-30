"use client";

import { ArrowRight, ChevronDown, MoreVertical, Package, Tag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ProductCategoryBadge } from "@/components/product-entry/product-category-selector";
import {
  ProductActionsMenu,
  type ProductActionItem,
} from "@/components/stock/product-actions-menu";
import { UNIT_LABELS } from "@/lib/errors";
import { isDisplayableUrl, mediaDisplayUrl } from "@/lib/media-upload";
import type { components } from "@moja-kuchnia/api-client";
import { cn } from "@/lib/utils";

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
  nested?: boolean;
};

export function CatalogProductRow({
  kitchenId,
  product,
  menuItems,
  onPreview,
  nested = false,
}: CatalogProductRowProps) {
  const image = productImageUrl(product);
  const brand =
    [product.brand?.trim(), product.variantLabel?.trim()]
      .filter(Boolean)
      .join(" · ") || null;
  const addBatchHref = `/kitchens/${kitchenId}/products/${product.id}/add-batch`;

  return (
    <div
      className={cn(
        "group grid grid-cols-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 sm:grid-cols-12 sm:gap-4",
        nested && "bg-zinc-50/60 pl-8 sm:pl-10",
      )}
      data-testid="catalog-product-card"
      data-product-id={product.id}
    >
      <div className="flex items-center gap-3 sm:col-span-5 sm:pl-2">
        <button
          type="button"
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-50"
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
              className="max-h-full max-w-full object-contain p-1.5"
            />
          ) : (
            <Package size={20} className="text-zinc-300" aria-hidden />
          )}
        </button>
        <div className="min-w-0">
          <h4 className="truncate text-base font-bold text-zinc-900">
            {product.name}
          </h4>
          {brand ? (
            <p className="truncate text-sm font-medium text-zinc-500">{brand}</p>
          ) : null}
        </div>
      </div>

      <div className="sm:col-span-2">
        <ProductCategoryBadge category={product.category} variant="pill" />
      </div>

      <div className="flex items-center gap-2 text-sm font-medium text-zinc-600 sm:col-span-2">
        <Tag size={14} className="shrink-0 text-zinc-400" aria-hidden />
        <span className="truncate">{product.ean ?? "—"}</span>
      </div>

      <div className="font-semibold text-zinc-900 sm:col-span-2">
        {UNIT_LABELS[product.defaultUnit]}
      </div>

      <div className="flex justify-end gap-1 sm:col-span-1 sm:pr-2 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
        <Link
          href={addBatchHref}
          className="rounded-lg p-2 text-zinc-500 transition-all hover:bg-white hover:text-emerald-600"
          title="Dodaj do zapasów"
        >
          <ArrowRight size={18} />
        </Link>
        <ProductActionsMenu
          label={`Akcje: ${product.name}`}
          items={menuItems}
          triggerClassName="rounded-lg p-2 text-zinc-500 transition-all hover:bg-white hover:text-zinc-900"
          icon={<MoreVertical size={18} />}
        />
      </div>
    </div>
  );
}

/** @deprecated Prefer CatalogProductRow */
export function CatalogProductCard(props: CatalogProductRowProps) {
  return <CatalogProductRow {...props} />;
}

type CatalogGroupRowProps = {
  kitchenId: string;
  groupId: string;
  groupName: string;
  variantCount: number;
  category?: string | null;
  variants: CatalogProduct[];
  buildMenuItems?: (product: {
    id: string;
    name: string;
    groupId?: string | null;
    totalQuantity?: string;
  }) => ProductActionItem[];
  onPreview?: (src: string, alt: string) => void;
};

export function CatalogGroupCard({
  kitchenId,
  groupId,
  groupName,
  variantCount,
  category,
  variants,
  buildMenuItems,
  onPreview,
}: CatalogGroupRowProps) {
  const [expanded, setExpanded] = useState(false);
  const cover = variants.map(productImageUrl).find(Boolean) ?? null;

  return (
    <div data-testid="catalog-group-card" data-group-id={groupId}>
      <div className="grid grid-cols-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 sm:grid-cols-12 sm:gap-4">
        <div className="flex items-center gap-3 sm:col-span-5 sm:pl-2">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-50">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt=""
                className="max-h-full max-w-full object-contain p-1.5"
              />
            ) : (
              <Package size={20} className="text-zinc-300" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-base font-bold text-zinc-900">
              {groupName}
            </h4>
            <p className="text-sm font-medium text-zinc-500">
              {variantCount} {variantCount === 1 ? "wariant" : "warianty"}
            </p>
          </div>
        </div>
        <div className="sm:col-span-2">
          <ProductCategoryBadge category={category} variant="pill" />
        </div>
        <div className="text-sm font-medium text-zinc-500 sm:col-span-2">—</div>
        <div className="font-semibold text-zinc-900 sm:col-span-2">—</div>
        <div className="flex justify-end gap-1 sm:col-span-1 sm:pr-2">
          <button
            type="button"
            className="rounded-lg p-2 text-zinc-500 transition-all hover:bg-white hover:text-zinc-900"
            aria-expanded={expanded}
            aria-label={expanded ? "Zwiń warianty" : "Rozwiń warianty"}
            onClick={() => setExpanded((open) => !open)}
          >
            <ChevronDown
              size={18}
              className={cn(
                "transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
          <Link
            href={`/kitchens/${kitchenId}/product-groups/${groupId}`}
            className="rounded-lg p-2 text-zinc-500 transition-all hover:bg-white hover:text-emerald-600"
            title="Otwórz rodzaj"
          >
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>

      {expanded ? (
        <div className="divide-y divide-zinc-100 border-t border-zinc-100">
          {variants.map((product) => {
            const menuItems =
              buildMenuItems?.({
                id: product.id,
                name: product.name,
                groupId: product.groupId,
                totalQuantity: product.totalQuantity,
              }) ?? [];
            return (
              <CatalogProductRow
                key={product.id}
                kitchenId={kitchenId}
                product={product}
                menuItems={menuItems}
                onPreview={onPreview}
                nested
              />
            );
          })}
          {variants.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500 sm:pl-10">
              Brak wariantów w tej stronie katalogu.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
