"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useQuery } from "@tanstack/react-query";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const committedLabel = displayLabel(value);
  const [draft, setDraft] = useState<string | null>(null);
  const query = draft ?? committedLabel;
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setDraft(null);
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
    !exactMatch &&
    value.mode !== "existing";

  function selectNone() {
    onChange({ mode: "none" });
    setDraft(null);
    setOpen(false);
  }

  function selectExisting(group: ProductGroup) {
    onChange({ mode: "existing", group });
    setDraft(null);
    setOpen(false);
  }

  function selectCreate(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    onChange({ mode: "create", name: trimmed });
    setDraft(null);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative space-y-2", className)}>
      <Label htmlFor={`product-kind-${listId}`}>Rodzaj produktu</Label>
      <Input
        id={`product-kind-${listId}`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        value={query}
        placeholder="np. Mozzarella — wyszukaj lub utwórz"
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          setOpen(true);
          if (!next.trim()) {
            onChange({ mode: "none" });
            return;
          }
          if (value.mode === "existing" && next !== value.group.name) {
            onChange({ mode: "none" });
          }
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      <p className="text-xs text-gray-500">
        Wspólna nazwa rodzaju (np. Mozzarella). Konkretną markę i wariant
        podasz poniżej. Możesz też zostawić bez rodzaju.
      </p>

      {value.mode === "existing" ? (
        <p className="text-xs text-emerald-700">
          Wybrano: {value.group.name || "…"}
          <button
            type="button"
            className="ml-2 font-medium underline"
            disabled={disabled}
            onClick={selectNone}
          >
            Odłącz
          </button>
        </p>
      ) : null}
      {value.mode === "create" ? (
        <p className="text-xs text-amber-800">
          Nowy rodzaj „{value.name}” zostanie utworzony przy zapisie.
          <button
            type="button"
            className="ml-2 font-medium underline"
            disabled={disabled}
            onClick={selectNone}
          >
            Anuluj
          </button>
        </p>
      ) : null}

      {suggestedGroups.length > 0 && value.mode === "none" ? (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500">Sugestie:</span>
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
            aria-selected={value.mode === "none"}
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
              className="flex w-full border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-amber-800 hover:bg-amber-50"
              onClick={() => selectCreate(debouncedQuery)}
            >
              Utwórz rodzaj „{debouncedQuery}”
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
  );
}

function displayLabel(value: ProductKindSelection): string {
  if (value.mode === "existing") {
    return value.group.name;
  }
  if (value.mode === "create") {
    return value.name;
  }
  return "";
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
