"use client";

import { Package } from "lucide-react";

import { cn } from "@/lib/utils";

type ProductThumbProps = {
  src: string | null;
  alt: string;
  className?: string;
  size?: "sm" | "md";
};

export function ProductThumb({
  src,
  alt,
  className,
  size = "md",
}: ProductThumbProps) {
  const sizeClass = size === "sm" ? "h-9 w-9" : "h-12 w-12";
  if (!src) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg bg-transparent text-stone-400",
          sizeClass,
          className,
        )}
        aria-hidden
      >
        <Package size={size === "sm" ? 16 : 20} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć
    <img
      src={src}
      alt={alt}
      className={cn(
        "shrink-0 rounded-lg object-contain bg-transparent",
        sizeClass,
        className,
      )}
    />
  );
}
