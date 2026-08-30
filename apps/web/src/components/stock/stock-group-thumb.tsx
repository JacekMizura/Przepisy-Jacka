"use client";

import { Package } from "lucide-react";

import { cn } from "@/lib/utils";

type StockGroupThumbProps = {
  className?: string;
};

/**
 * Nagłówek rodzaju nie pokazuje zdjęć wariantów (bez kolażu i bez „pierwszego” zdjęcia).
 * Konkretne miniatury zostają przy wierszach wariantów po rozwinięciu.
 */
export function StockGroupThumb({ className }: StockGroupThumbProps) {
  return (
    <div
      className={cn(
        "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50",
        className,
      )}
      aria-hidden
    >
      <Package size={18} className="text-gray-300" />
    </div>
  );
}
