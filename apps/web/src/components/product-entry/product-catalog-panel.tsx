"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ChevronDown, Package } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  ProductActionsMenu,
  type ProductActionItem,
} from "@/components/stock/product-actions-menu";
import { StockListToolbar } from "@/components/stock/stock-filters";
import { StockGroupThumb } from "@/components/stock/stock-group-thumb";
import { formatDisplayQuantityWithUnit } from "@/lib/format-quantity";
import { isDisplayableUrl, mediaDisplayUrl } from "@/lib/media-upload";
import { pluralizeVariants, pluralizeBatches } from "@/lib/stock-group-presentation";
import type {
  CatalogGroupRow,
  CatalogListEntry,
} from "@/lib/stock-list-types";
import type {
  StockListUrlPatch,
  StockListUrlState,
} from "@/lib/stock-url-state";
import { cn } from "@/lib/utils";

type CatalogProduct = components["schemas"]["CatalogProductDto"];

type ProductCatalogPanelProps = {
  kitchenId: string;
  /** Gdy true — bez wewnętrznego CTA „Dodaj do katalogu” (CTA jest w nagłówku zakładki). */
  embedded?: boolean;
  items: CatalogListEntry[];
  page: number;
  pageCount: number;
  total: number;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
  urlState: StockListUrlState;
  onUrlPatch: (patch: StockListUrlPatch) => void;
  onPreview?: (src: string, alt: string) => void;
  onArchiveProduct?: (product: { id: string; name: string }) => void;
  onUndoAddition?: (product: { id: string; name: string }) => void;
  onWriteOffAndArchive?: (product: { id: string; name: string }) => void;
  onAddToList?: (product: { id: string; name: string }) => void;
  addToListPending?: boolean;
  buildMenuItems?: (product: {
    id: string;
    name: string;
    groupId?: string | null;
    totalQuantity?: string;
  }) => ProductActionItem[];
};

export function ProductCatalogPanel({
  kitchenId,
  embedded = false,
  items,
  page,
  pageCount,
  total,
  isPending,
  isError,
  errorMessage,
  urlState,
  onUrlPatch,
  onPreview,
  onArchiveProduct,
  onUndoAddition,
  onWriteOffAndArchive,
  onAddToList,
  addToListPending = false,
  buildMenuItems,
}: ProductCatalogPanelProps) {
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleGroup(groupId: string) {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <div className={cn("space-y-3", !embedded && "p-4")}>
      <StockListToolbar
        mode="catalog"
        state={urlState}
        onPatch={onUrlPatch}
        resultTotal={total}
        resultLabel={total === 1 ? "pozycja" : "pozycji"}
        searchAriaLabel="Szukaj w katalogu"
        searchPlaceholder="Szukaj rodzaju, produktu, marki, EAN…"
      />

      {isPending ? (
        <p className="px-2 py-6 text-center text-sm text-gray-500">
          Ładowanie katalogu…
        </p>
      ) : null}
      {isError ? (
        <p className="px-2 py-6 text-center text-sm text-red-600" role="alert">
          {errorMessage ?? "Nie udało się pobrać katalogu."}
        </p>
      ) : null}

      {!isPending && !isError && items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          {urlState.search
            ? "Brak wyników dla tego wyszukiwania."
            : "Katalog jest pusty — dodaj pierwszy produkt."}
        </p>
      ) : null}

      {items.length > 0 ? (
        <>
          <ul
            className="border border-gray-200 bg-white"
            data-testid="catalog-compact-list"
          >
            {items.map((entry) => {
              if (entry.kind === "product") {
                const kindBadge = entry.groupName;
                return (
                  <li key={entry.product.id}>
                    <CatalogProductCompactRow
                      kitchenId={kitchenId}
                      product={entry.product}
                      kindBadge={kindBadge}
                      nested={false}
                      onPreview={onPreview}
                      onArchiveProduct={onArchiveProduct}
                      onUndoAddition={onUndoAddition}
                      onWriteOffAndArchive={onWriteOffAndArchive}
                      onAddToList={onAddToList}
                      addToListPending={addToListPending}
                      buildMenuItems={buildMenuItems}
                    />
                  </li>
                );
              }
              return (
                <CatalogGroupBlock
                  key={`group:${entry.groupId}`}
                  kitchenId={kitchenId}
                  group={entry}
                  expanded={expandedGroupIds.has(entry.groupId)}
                  onToggle={() => toggleGroup(entry.groupId)}
                  onPreview={onPreview}
                  onArchiveProduct={onArchiveProduct}
                  onUndoAddition={onUndoAddition}
                  onWriteOffAndArchive={onWriteOffAndArchive}
                  onAddToList={onAddToList}
                  addToListPending={addToListPending}
                  buildMenuItems={buildMenuItems}
                />
              );
            })}
          </ul>
          {pageCount > 1 ? (
            <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
              <button
                type="button"
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => onUrlPatch({ page: page - 1 })}
              >
                Poprzednia
              </button>
              <span className="tabular-nums">
                Strona {page} / {pageCount}
              </span>
              <button
                type="button"
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 disabled:opacity-40"
                disabled={page >= pageCount}
                onClick={() => onUrlPatch({ page: page + 1 })}
              >
                Następna
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function CatalogGroupBlock({
  kitchenId,
  group,
  expanded,
  onToggle,
  onPreview,
  onArchiveProduct,
  onUndoAddition,
  onWriteOffAndArchive,
  onAddToList,
  addToListPending,
  buildMenuItems,
}: {
  kitchenId: string;
  group: CatalogGroupRow;
  expanded: boolean;
  onToggle: () => void;
  onPreview?: (src: string, alt: string) => void;
  onArchiveProduct?: (product: { id: string; name: string }) => void;
  onUndoAddition?: (product: { id: string; name: string }) => void;
  onWriteOffAndArchive?: (product: { id: string; name: string }) => void;
  onAddToList?: (product: { id: string; name: string }) => void;
  addToListPending?: boolean;
  buildMenuItems?: ProductCatalogPanelProps["buildMenuItems"];
}) {
  const qty = formatDisplayQuantityWithUnit(
    group.totalQuantity,
    group.defaultUnit,
  );
  const subtitle = `${pluralizeVariants(group.variantCount)} · ${pluralizeBatches(group.batchCount)}`;

  return (
    <li>
      <button
        type="button"
        className="flex min-h-14 w-full items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-left hover:bg-gray-50"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <StockGroupThumb size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {group.groupName}
          </p>
          <p className="text-[11px] text-gray-500">{subtitle}</p>
        </div>
        <p className="shrink-0 text-sm tabular-nums text-gray-800">{qty}</p>
        <ChevronDown
          size={15}
          className={cn(
            "shrink-0 text-gray-400 transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {expanded ? (
        <ul>
          {group.variants.map((product) => (
            <li key={product.id}>
              <CatalogProductCompactRow
                kitchenId={kitchenId}
                product={product}
                nested
                onPreview={onPreview}
                onArchiveProduct={onArchiveProduct}
                onUndoAddition={onUndoAddition}
                onWriteOffAndArchive={onWriteOffAndArchive}
                onAddToList={onAddToList}
                addToListPending={addToListPending}
                buildMenuItems={buildMenuItems}
              />
            </li>
          ))}
          <li className="border-b border-gray-100 px-4 py-2 text-right">
            <Link
              href={`/kitchens/${kitchenId}/product-groups/${group.groupId}`}
              className="text-xs font-medium text-emerald-700 hover:underline"
            >
              Zarządzaj rodzajem
            </Link>
          </li>
        </ul>
      ) : null}
    </li>
  );
}

function CatalogProductCompactRow({
  kitchenId,
  product,
  kindBadge,
  nested,
  onPreview,
  onArchiveProduct,
  onUndoAddition,
  onWriteOffAndArchive,
  onAddToList,
  addToListPending,
  buildMenuItems,
}: {
  kitchenId: string;
  product: CatalogProduct;
  kindBadge?: string | null;
  nested: boolean;
  onPreview?: (src: string, alt: string) => void;
  onArchiveProduct?: (product: { id: string; name: string }) => void;
  onUndoAddition?: (product: { id: string; name: string }) => void;
  onWriteOffAndArchive?: (product: { id: string; name: string }) => void;
  onAddToList?: (product: { id: string; name: string }) => void;
  addToListPending?: boolean;
  buildMenuItems?: ProductCatalogPanelProps["buildMenuItems"];
}) {
  const thumb =
    mediaDisplayUrl(product.image, "thumbnail") ??
    (isDisplayableUrl(product.imageUrl) ? product.imageUrl : null);
  const full =
    mediaDisplayUrl(product.image) ??
    (isDisplayableUrl(product.imageUrl) ? product.imageUrl : null);
  const meta = [product.brand, product.variantLabel].filter(Boolean).join(" · ");
  const inStock = Number(product.totalQuantity) > 0;
  const qty = inStock
    ? formatDisplayQuantityWithUnit(product.totalQuantity, product.defaultUnit)
    : "Brak w zapasach";

  const menuItems: ProductActionItem[] =
    buildMenuItems?.({
      id: product.id,
      name: product.name,
      groupId: product.groupId,
      totalQuantity: product.totalQuantity,
    }) ??
    defaultCatalogMenuItems({
      kitchenId,
      product,
      onArchiveProduct,
      onUndoAddition,
      onWriteOffAndArchive,
      onAddToList,
      addToListPending,
    });

  return (
    <div
      className={cn(
        "flex min-h-14 items-center gap-2 border-b border-gray-100 px-2 py-1.5",
        nested && "bg-gray-50/40 pl-8",
      )}
    >
      <button
        type="button"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50",
          full && "hover:bg-gray-100",
        )}
        disabled={!full || !thumb}
        onClick={() => {
          if (full) {
            onPreview?.(full, product.name);
          }
        }}
        aria-label={full ? `Powiększ zdjęcie: ${product.name}` : undefined}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e
          <img src={thumb} alt="" className="h-full w-full object-contain" />
        ) : (
          <Package size={14} className="text-gray-300" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-medium text-gray-900">
            {product.name}
          </p>
          {kindBadge ? (
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
              {kindBadge}
            </span>
          ) : null}
          {product.isArchived ? (
            <span className="text-[10px] font-medium text-amber-700">
              Archiwum
            </span>
          ) : null}
        </div>
        {meta ? (
          <p className="truncate text-[11px] text-gray-500">{meta}</p>
        ) : null}
      </div>
      <p
        className={cn(
          "hidden shrink-0 text-sm tabular-nums sm:block",
          inStock ? "text-gray-800" : "text-gray-400",
        )}
      >
        {qty}
      </p>
      <div className="shrink-0">
        <ProductActionsMenu label={`Akcje: ${product.name}`} items={menuItems} />
      </div>
    </div>
  );
}

function defaultCatalogMenuItems(args: {
  kitchenId: string;
  product: {
    id: string;
    name: string;
    groupId?: string | null;
    totalQuantity?: string;
  };
  onArchiveProduct?: (product: { id: string; name: string }) => void;
  onUndoAddition?: (product: { id: string; name: string }) => void;
  onWriteOffAndArchive?: (product: { id: string; name: string }) => void;
  onAddToList?: (product: { id: string; name: string }) => void;
  addToListPending?: boolean;
}): ProductActionItem[] {
  const { kitchenId, product } = args;
  const items: ProductActionItem[] = [
    {
      id: "edit",
      label: "Edytuj produkt",
      href: `/kitchens/${kitchenId}/products/${product.id}/edit`,
    },
    {
      id: "batch",
      label: "Dodaj partię",
      href: `/kitchens/${kitchenId}/products/${product.id}/add-batch`,
    },
  ];
  if (args.onAddToList) {
    items.push({
      id: "list",
      label: "Dodaj do listy zakupów",
      onSelect: () =>
        args.onAddToList!({ id: product.id, name: product.name }),
      disabled: args.addToListPending,
    });
  }
  if (product.groupId) {
    items.push({
      id: "kind",
      label: "Przejdź do rodzaju",
      href: `/kitchens/${kitchenId}/product-groups/${product.groupId}`,
    });
  } else {
    items.push({
      id: "assign",
      label: "Przypisz do rodzaju",
      href: `/kitchens/${kitchenId}/products/${product.id}/edit`,
    });
  }
  if (args.onUndoAddition) {
    items.push({
      id: "undo",
      label: "Cofnij dodanie",
      onSelect: () =>
        args.onUndoAddition!({ id: product.id, name: product.name }),
      destructive: true,
    });
  } else if (args.onArchiveProduct) {
    items.push({
      id: "archive",
      label: "Archiwizuj",
      onSelect: () =>
        args.onArchiveProduct!({ id: product.id, name: product.name }),
      destructive: true,
    });
  }
  if (
    args.onWriteOffAndArchive &&
    product.totalQuantity != null &&
    Number(product.totalQuantity) > 0
  ) {
    items.push({
      id: "writeoff-archive",
      label: "Odpisz stan i archiwizuj",
      onSelect: () =>
        args.onWriteOffAndArchive!({ id: product.id, name: product.name }),
      destructive: true,
    });
  }
  return items;
}

/** Format zbiorczego stanu grupy (używane na stronie rodzaju). */
export function formatGroupStock(
  group: components["schemas"]["ProductGroupSummaryDto"],
): string {
  if (group.stockByUnit.length === 0) {
    return "Brak w zapasach";
  }
  return group.stockByUnit
    .map((entry) =>
      formatDisplayQuantityWithUnit(entry.totalQuantity, entry.unit),
    )
    .join(" · ");
}
