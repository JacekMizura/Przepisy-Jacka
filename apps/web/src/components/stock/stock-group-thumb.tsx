"use client";

import { Package } from "lucide-react";

import { cn } from "@/lib/utils";

type StockGroupThumbProps = {
  className?: string;
  size?: "sm" | "md";
};

/**
 * Nagłówek rodzaju nie pokazuje zdjęć wariantów (bez kolażu i bez „pierwszego” zdjęcia).
 * Konkretne miniatury zostają przy wierszach wariantów po rozwinięciu.
 */
export function StockGroupThumb({
  className,
  size = "md",
}: StockGroupThumbProps) {
  const box =
    size === "sm"
      ? "h-9 w-9 rounded-md"
      : "h-12 w-12 rounded-xl";
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden border border-gray-200 bg-gray-50",
        box,
        className,
      )}
      aria-hidden
    >
      <Package size={size === "sm" ? 14 : 18} className="text-gray-300" />
    </div>
  );
}
