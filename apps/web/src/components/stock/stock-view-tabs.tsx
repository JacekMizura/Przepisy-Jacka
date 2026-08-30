"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

import {
  type StockView,
} from "@/components/stock/stock-view";
import {
  applyStockListPatch,
  buildStockListHref,
  type StockListUrlState,
} from "@/lib/stock-url-state";

const TABS: { id: StockView; label: string }[] = [
  { id: "stock", label: "Zapasy" },
  { id: "catalog", label: "Katalog" },
  { id: "history", label: "Historia" },
];

type StockViewTabsProps = {
  kitchenId: string;
  active: StockView;
  urlState?: StockListUrlState;
};

export function StockViewTabs({
  kitchenId,
  active,
  urlState,
}: StockViewTabsProps) {
  return (
    <nav
      aria-label="Widoki zapasów"
      className="grid w-full grid-cols-3 gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const href = urlState
          ? buildStockListHref(
              kitchenId,
              applyStockListPatch(urlState, { view: tab.id, page: 1 }),
            )
          : tab.id === "stock"
            ? `/kitchens/${kitchenId}/stock`
            : `/kitchens/${kitchenId}/stock?view=${tab.id}`;
        return (
          <Link
            key={tab.id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors",
              isActive
                ? "bg-white text-emerald-900 shadow-sm ring-1 ring-emerald-100"
                : "text-gray-600 hover:bg-white/70 hover:text-gray-900",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
