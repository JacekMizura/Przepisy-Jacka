"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";

type ProductGroup = components["schemas"]["ProductGroupDto"];

export type ProductKindSelection =
  | { mode: "none" }
  | { mode: "existing"; group: ProductGroup }
  | { mode: "create"; name: string };

type ProductKindFieldProps = {
  kitchenId: string;
  value: ProductKindSelection;
  onChange: (value: ProductKindSelection) => void;
  suggestedGroups?: ProductGroup[];
  disabled?: boolean;
  className?: string;
};

export function ProductKindField({
  kitchenId,
  value,
  onChange,
  suggestedGroups = [],
  disabled = false,
  className,
}: ProductKindFieldProps) {
  const listId = useId();
  const inputId = `product-kind-${listId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const selected = value.mode !== "none";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(draft.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const searchQuery = useQuery({
    queryKey: ["product-groups-search", kitchenId, debouncedQuery],
    enabled: open && debouncedQuery.length >= 1,
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/product-groups/search",
        {
          params: {
            path: { kitchenId },
            query: { q: debouncedQuery },
          },
        },
      );
      if (error) {
        throw new Error(
          readApiError(error, "Nie udało się wyszukać rodzajów."),
        );
      }
      return data ?? [];
    },
  });

  const results = searchQuery.data ?? [];
  const exactMatch = results.find(
    (group) =>
      group.name.localeCompare(debouncedQuery, "pl", {
        sensitivity: "accent",
      }) === 0,
  );
  const canCreate =
    debouncedQuery.length >= 2 &&
    !exactMatch;

  function selectNone() {
    onChange({ mode: "none" });
    setDraft("");
    setOpen(false);
  }

  function selectExisting(group: ProductGroup) {
    onChange({ mode: "existing", group });
    setDraft("");
    setOpen(false);
  }

  function selectCreate(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    onChange({ mode: "create", name: trimmed });
    setDraft("");
    setOpen(false);
  }

  function openPicker() {
    if (disabled) {
      return;
    }
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div ref={rootRef} className={cn("relative space-y-2", className)}>
      <Label htmlFor={inputId}>Rodzaj produktu</Label>

      {selected ? (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
              value.mode === "create"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900",
            )}
          >
            <span className="truncate">
              {value.mode === "existing" ? value.group.name : value.name}
            </span>
            {value.mode === "create" ? (
              <span className="shrink-0 text-xs font-normal text-amber-700">
                nowy
              </span>
            ) : null}
            <button
              type="button"
              aria-label="Wyczyść rodzaj"
              disabled={disabled}
              className="shrink-0 rounded-full p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100 disabled:opacity-40"
              onClick={selectNone}
            >
              <X size={14} />
            </button>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={openPicker}
          >
            Zmień
          </Button>
        </div>
      ) : null}

      {!selected || open ? (
        <div className="relative">
          <div className="relative">
            <Input
              ref={inputRef}
              id={inputId}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              disabled={disabled}
              value={draft}
              placeholder="Szukaj lub utwórz rodzaj…"
              onChange={(event) => {
                setDraft(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              autoComplete="off"
              className="pr-10"
            />
            <ChevronsUpDown
              size={16}
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gray-400"
            />
          </div>

          {suggestedGroups.length > 0 && !selected && draft.trim().length === 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestedGroups.slice(0, 4).map((group) => (
                <Button
                  key={group.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => selectExisting(group)}
                >
                  {group.name}
                </Button>
              ))}
            </div>
          ) : null}

          {open && !disabled ? (
            <div
              id={listId}
              role="listbox"
              className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="option"
                aria-selected={!selected}
                className="flex w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
                onClick={selectNone}
              >
                Bez rodzaju
              </button>
              {searchQuery.isPending && debouncedQuery.length >= 1 ? (
                <p className="px-3 py-2 text-xs text-gray-400">Szukam…</p>
              ) : null}
              {results.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  role="option"
                  aria-selected={
                    value.mode === "existing" && value.group.id === group.id
                  }
                  className="flex w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-emerald-50"
                  onClick={() => selectExisting(group)}
                >
                  {group.name}
                </button>
              ))}
              {canCreate ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={
                    value.mode === "create" && value.name === debouncedQuery
                  }
                  className="flex w-full border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                  onClick={() => selectCreate(debouncedQuery)}
                >
                  Utwórz «{debouncedQuery}»
                </button>
              ) : null}
              {debouncedQuery.length >= 1 &&
              !searchQuery.isPending &&
              results.length === 0 &&
              !canCreate ? (
                <p className="px-3 py-2 text-xs text-gray-400">
                  Brak dopasowań. Wpisz co najmniej 2 znaki, aby utworzyć nowy.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function initialKindFromProduct(product: {
  groupId?: string | null;
  groupName?: string | null;
} | null): ProductKindSelection {
  if (product?.groupId && product.groupName) {
    return {
      mode: "existing",
      group: {
        id: product.groupId,
        kitchenId: "",
        name: product.groupName,
        normalizedName: product.groupName.toLowerCase(),
        createdAt: "",
        updatedAt: "",
      },
    };
  }
  return { mode: "none" };
}

export function initialKindFromGroupId(
  groupId: string | null | undefined,
  groupName?: string | null,
): ProductKindSelection {
  if (groupId && groupName) {
    return {
      mode: "existing",
      group: {
        id: groupId,
        kitchenId: "",
        name: groupName,
        normalizedName: groupName.toLowerCase(),
        createdAt: "",
        updatedAt: "",
      },
    };
  }
  if (groupId) {
    return {
      mode: "existing",
      group: {
        id: groupId,
        kitchenId: "",
        name: "",
        normalizedName: "",
        createdAt: "",
        updatedAt: "",
      },
    };
  }
  return { mode: "none" };
}
