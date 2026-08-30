"use client";

import { MoreVertical, Package, Plus } from "lucide-react";
import Link from "next/link";

import {
  ProductActionsMenu,
  type ProductActionItem,
} from "@/components/stock/product-actions-menu";
import { isDisplayableUrl, mediaDisplayUrl } from "@/lib/media-upload";
import type { components } from "@moja-kuchnia/api-client";
import { cn } from "@/lib/utils";

type CatalogProduct = components["schemas"]["CatalogProductDto"];

function getCategoryColor(category: string | null | undefined): string {
  switch (category) {
    case "Warzywa i owoce":
    case "Warzywa":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "Nabiał":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "Mięso i ryby":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "Pieczywo":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "Spiżarnia":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "Mrożonki":
      return "bg-cyan-100 text-cyan-700 border-cyan-200";
    case "Napoje":
      return "bg-indigo-100 text-indigo-700 border-indigo-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function productImageUrl(product: CatalogProduct): string | null {
  return (
    mediaDisplayUrl(product.image, "thumbnail") ??
    (isDisplayableUrl(product.imageUrl) ? product.imageUrl : null)
  );
}

type CatalogProductCardProps = {
  kitchenId: string;
  product: CatalogProduct;
  menuItems: ProductActionItem[];
  onPreview?: (src: string, alt: string) => void;
};

export function CatalogProductCard({
  kitchenId,
  product,
  menuItems,
  onPreview,
}: CatalogProductCardProps) {
  const image = productImageUrl(product);
  const category = product.category?.trim() || "Bez kategorii";
  const brand = product.brand?.trim() || null;
  const subtitle = product.variantLabel?.trim() || null;
  const addBatchHref = `/kitchens/${kitchenId}/products/${product.id}/add-batch`;

  return (
    <article
      className="group relative flex h-full flex-col rounded-3xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all duration-300 hover:border-emerald-200 hover:shadow-xl"
      data-testid="catalog-product-card"
      data-product-id={product.id}
    >
      <div className="absolute top-4 right-4 z-20">
        <ProductActionsMenu
          label={`Akcje: ${product.name}`}
          items={menuItems}
          triggerClassName="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-600"
          icon={<MoreVertical size={16} />}
        />
      </div>

      <div className="mb-4 flex flex-col items-center pt-2">
        <button
          type="button"
          className="mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-3 transition-transform duration-300 group-hover:scale-105"
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
              className="h-full w-full object-contain drop-shadow-sm"
            />
          ) : (
            <Package size={36} className="text-slate-300" aria-hidden />
          )}
        </button>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-[10px] font-bold tracking-wider uppercase",
            getCategoryColor(product.category),
          )}
        >
          {category}
        </span>
      </div>

      <div className="flex-1 text-center">
        {brand ? (
          <p className="mb-0.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            {brand}
          </p>
        ) : null}
        <h3 className="text-lg leading-tight font-bold text-slate-800">
          {product.name}
        </h3>
        {subtitle ? (
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        ) : null}
      </div>

      <div className="mt-5 flex justify-center border-t border-slate-50 pt-4">
        <Link
          href={addBatchHref}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white"
        >
          <Plus size={16} aria-hidden />
          Dodaj do zapasów
        </Link>
      </div>
    </article>
  );
}

type CatalogGroupCardProps = {
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
}: CatalogGroupCardProps) {
  const label = category?.trim() || "Rodzaj";
  const href = `/kitchens/${kitchenId}/product-groups/${groupId}`;

  return (
    <article
      className="group relative flex h-full flex-col rounded-3xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all duration-300 hover:border-emerald-200 hover:shadow-xl"
      data-testid="catalog-group-card"
      data-group-id={groupId}
    >
      <div className="absolute top-4 right-4 z-20">
        <ProductActionsMenu
          label={`Akcje rodzaju: ${groupName}`}
          items={[
            { id: "manage", label: "Zarządzaj rodzajem", href },
            {
              id: "add-variant",
              label: "Dodaj wariant",
              href: `/kitchens/${kitchenId}/products/new?groupId=${groupId}`,
            },
          ]}
          triggerClassName="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 shadow-sm hover:bg-slate-50 hover:text-slate-600"
          icon={<MoreVertical size={16} />}
        />
      </div>

      <div className="mb-4 flex flex-col items-center pt-2">
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 p-3 transition-transform duration-300 group-hover:scale-105">
          <Package size={36} className="text-slate-300" aria-hidden />
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-[10px] font-bold tracking-wider uppercase",
            getCategoryColor(category),
          )}
        >
          {label}
        </span>
      </div>

      <div className="flex-1 text-center">
        <h3 className="text-lg leading-tight font-bold text-slate-800">
          {groupName}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {variantCount} {variantCount === 1 ? "wariant" : "warianty"}
        </p>
      </div>

      <div className="mt-5 flex justify-center border-t border-slate-50 pt-4">
        <Link
          href={href}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white"
        >
          Zarządzaj rodzajem
        </Link>
      </div>
    </article>
  );
}
