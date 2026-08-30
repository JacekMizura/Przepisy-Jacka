"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

import { type StockView } from "@/components/stock/stock-view";
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
  variant?: "default" | "modern";
};

export function StockViewTabs({
  kitchenId,
  active,
  urlState,
  variant = "default",
}: StockViewTabsProps) {
  if (variant === "modern") {
    return (
      <nav
        aria-label="Widoki zapasów"
        className="flex rounded-2xl bg-slate-50 p-1"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          const href = tabHref(kitchenId, tab.id, urlState);
          return (
            <Link
              key={tab.id}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-xl px-6 py-2.5 text-sm font-semibold transition-all",
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Widoki zapasów"
      className="grid w-full grid-cols-3 gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const href = tabHref(kitchenId, tab.id, urlState);
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

function tabHref(
  kitchenId: string,
  tabId: StockView,
  urlState?: StockListUrlState,
): string {
  if (urlState) {
    return buildStockListHref(
      kitchenId,
      applyStockListPatch(urlState, { view: tabId, page: 1 }),
    );
  }
  return tabId === "stock"
    ? `/kitchens/${kitchenId}/stock`
    : `/kitchens/${kitchenId}/stock?view=${tabId}`;
}
