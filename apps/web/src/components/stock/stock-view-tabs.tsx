"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

import {
  type StockView,
  stockViewHref,
} from "@/components/stock/stock-view";

const TABS: { id: StockView; label: string }[] = [
  { id: "stock", label: "Zapasy" },
  { id: "catalog", label: "Katalog" },
  { id: "history", label: "Historia" },
];

type StockViewTabsProps = {
  kitchenId: string;
  active: StockView;
};

export function StockViewTabs({ kitchenId, active }: StockViewTabsProps) {
  return (
    <nav
      aria-label="Widoki zapasów"
      className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={stockViewHref(kitchenId, tab.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "min-w-0 flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium whitespace-nowrap transition-colors",
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
