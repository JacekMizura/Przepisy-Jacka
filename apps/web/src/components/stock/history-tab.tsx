"use client";

import type { components } from "@moja-kuchnia/api-client";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatQuantityWithUnit } from "@/lib/format-quantity";
import { zlotyFromMinor, type BaseUnit } from "@/lib/quantity-input";

type StockConsumption = components["schemas"]["StockConsumptionResultDto"];
type Product = components["schemas"]["ProductDto"];

type KindFilter = "" | "consume" | "write_off" | "reversal";

type HistoryTabProps = {
  entries: StockConsumption[];
  products: Product[];
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
  reversePending: boolean;
  reverseError?: string | null;
  onReverse: (consumptionId: string) => void;
};

export function HistoryTab({
  entries,
  products,
  isPending,
  isError,
  errorMessage,
  reversePending,
  reverseError,
  onReverse,
}: HistoryTabProps) {
  const [kindFilter, setKindFilter] = useState<KindFilter>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const productsById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const product of products) {
      map.set(product.id, product);
    }
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (kindFilter === "reversal") {
        if (!entry.isReversal) return false;
      } else if (kindFilter === "consume") {
        if (entry.isReversal || entry.kind !== "consume") return false;
      } else if (kindFilter === "write_off") {
        if (entry.isReversal || entry.kind !== "write_off") return false;
      }

      const created = new Date(entry.createdAt);
      if (dateFrom) {
        const from = new Date(`${dateFrom}T00:00:00`);
        if (created < from) return false;
      }
      if (dateTo) {
        const to = new Date(`${dateTo}T23:59:59.999`);
        if (created > to) return false;
      }
      return true;
    });
  }, [dateFrom, dateTo, entries, kindFilter]);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white/80 p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
          <span className="font-medium whitespace-nowrap">Rodzaj</span>
          <select
            className="field-input py-2"
            value={kindFilter}
            onChange={(event) =>
              setKindFilter(event.target.value as KindFilter)
            }
            aria-label="Filtr rodzaju historii"
          >
            <option value="">Wszystkie</option>
            <option value="consume">Zużycie</option>
            <option value="write_off">Odpis</option>
            <option value="reversal">Cofnięcie</option>
          </select>
        </label>
        <label className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
          <span className="font-medium whitespace-nowrap">Od</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="w-auto"
            aria-label="Data od"
          />
        </label>
        <label className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
          <span className="font-medium whitespace-nowrap">Do</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="w-auto"
            aria-label="Data do"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {isPending ? (
          <p className="p-6 text-sm text-gray-500">Ładowanie historii…</p>
        ) : null}
        {isError ? (
          <p className="p-6 text-sm text-red-600" role="alert">
            {errorMessage ?? "Nie udało się pobrać historii."}
          </p>
        ) : null}
        {!isPending && !isError && filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            {entries.length === 0
              ? "Brak zapisanych zużyć i odpisów."
              : "Brak wpisów dla wybranych filtrów."}
          </p>
        ) : null}
        {filtered.length > 0 ? (
          <ul className="divide-y divide-gray-50">
            {filtered.map((entry) => {
              const unit = productsById.get(entry.productId)?.defaultUnit as
                | BaseUnit
                | undefined;
              return (
                <li key={entry.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-gray-900">
                        {entry.productName ?? entry.productId}
                        {entry.isReversal ? (
                          <span className="ml-2 text-xs font-semibold text-amber-800">
                            Cofnięcie
                          </span>
                        ) : entry.kind === "write_off" ? (
                          <span className="ml-2 text-xs font-semibold text-rose-800">
                            Odpis
                          </span>
                        ) : (
                          <span className="ml-2 text-xs font-semibold text-gray-600">
                            Zużycie
                          </span>
                        )}
                        {entry.isReversed ? (
                          <span className="ml-2 text-xs font-semibold text-gray-500">
                            Cofnięte
                          </span>
                        ) : null}
                      </p>
                      {entry.reason ? (
                        <p className="text-gray-700">Powód: {entry.reason}</p>
                      ) : null}
                      <p className="text-gray-600">
                        {formatQuantityWithUnit(entry.totalQuantity, unit)}
                        {" · "}
                        {entry.costComplete && entry.totalCostMinor != null
                          ? `${zlotyFromMinor(entry.totalCostMinor)} zł`
                          : "koszt niekompletny"}
                        {" · "}
                        {new Date(entry.createdAt).toLocaleString("pl-PL")}
                      </p>
                      <ul className="text-xs text-gray-500">
                        {entry.lines.map((line) => (
                          <li key={`${entry.id}-${line.stockItemId}`}>
                            {formatQuantityWithUnit(line.quantity, unit)}
                            {line.storeName ? ` · ${line.storeName}` : ""}
                            {line.costMinor != null
                              ? ` · ${zlotyFromMinor(line.costMinor)} zł`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {!entry.isReversal && !entry.isReversed ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={reversePending}
                        onClick={() => onReverse(entry.id)}
                      >
                        Cofnij
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        {reverseError ? (
          <p className="border-t border-gray-50 px-4 py-3 text-sm text-red-600">
            {reverseError}
          </p>
        ) : null}
      </div>
      <p className="text-xs text-gray-400">
        Filtry dat działają na załadowanej liście (API nie obsługuje jeszcze
        zakresu dat).
      </p>
    </section>
  );
}
