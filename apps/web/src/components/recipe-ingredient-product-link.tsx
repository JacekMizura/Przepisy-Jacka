"use client";

import type { components } from "@moja-kuchnia/api-client";
import { Link2, Link2Off, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { UNIT_LABELS } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Product = components["schemas"]["ProductDto"];

type RecipeIngredientProductLinkProps = {
  products: Product[];
  productId: string;
  onChange: (productId: string, product: Product | null) => void;
  disabled?: boolean;
};

function productSearchBlob(product: Product): string {
  return [
    product.name,
    product.brand ?? "",
    product.variantLabel ?? "",
    product.ean ?? "",
    product.groupName ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function productLabel(product: Product): string {
  const parts = [product.name];
  if (product.brand?.trim()) {
    parts.push(product.brand.trim());
  }
  if (product.variantLabel?.trim()) {
    parts.push(product.variantLabel.trim());
  }
  return parts.join(" · ");
}

export function RecipeIngredientProductLink({
  products,
  productId,
  onChange,
  disabled = false,
}: RecipeIngredientProductLinkProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [products, productId],
  );
  const orphaned = Boolean(productId) && !selected;

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const pool = products.filter((product) => !product.isArchived || product.id === productId);
    if (!normalized) {
      return pool.slice(0, 12);
    }
    return pool
      .filter((product) => productSearchBlob(product).includes(normalized))
      .slice(0, 20);
  }, [products, productId, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (selected) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-1.5",
          selected.isArchived
            ? "border-amber-200 bg-amber-50"
            : "border-stone-200 bg-stone-50",
        )}
      >
        <Link2
          size={14}
          className={selected.isArchived ? "text-amber-600" : "text-emerald-500"}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-stone-800">
            {productLabel(selected)}
            <span className="ml-1 font-medium text-stone-500">
              ({UNIT_LABELS[selected.defaultUnit]})
            </span>
          </p>
          {selected.isArchived ? (
            <p className="text-[11px] text-amber-700">Produkt zarchiwizowany</p>
          ) : null}
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md p-1 text-stone-400 hover:bg-white hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
          aria-label="Odłącz produkt"
          disabled={disabled}
          onClick={() => onChange("", null)}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    );
  }

  if (orphaned) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5">
        <Link2Off size={14} className="text-red-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-red-800">
            Produkt niedostępny lub usunięty
          </p>
          <p className="truncate text-[11px] text-red-600">{productId}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md p-1 text-red-400 hover:bg-white hover:text-red-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
          aria-label="Odłącz niedostępny produkt"
          disabled={disabled}
          onClick={() => onChange("", null)}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative z-20">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-dashed border-stone-300 bg-stone-50/50 px-3 py-1.5",
          open && "border-emerald-400 bg-emerald-50/40",
        )}
      >
        <Search size={14} className="shrink-0 text-stone-400" aria-hidden />
        <input
          type="search"
          value={query}
          disabled={disabled}
          placeholder="Wyszukaj produkt (nazwa, marka, EAN)…"
          className="min-w-0 flex-1 bg-transparent text-xs text-stone-700 outline-none placeholder:text-stone-400"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          role="combobox"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-56 overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.08)]"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-stone-500">Brak wyników</li>
          ) : (
            results.map((product) => (
              <li key={product.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-emerald-50 focus-visible:bg-emerald-50 focus-visible:outline-none"
                  onClick={() => {
                    onChange(product.id, product);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <span className="text-xs font-semibold text-stone-800">
                    {productLabel(product)}
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {UNIT_LABELS[product.defaultUnit]}
                    {product.ean ? ` · EAN ${product.ean}` : ""}
                    {product.isArchived ? " · zarchiwizowany" : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
