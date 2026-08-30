"use client";

import { Package } from "lucide-react";

import {
  buildGroupThumbCollage,
  type GroupThumbCollageModel,
} from "@/lib/stock-group-presentation";
import { cn } from "@/lib/utils";

type StockGroupThumbProps = {
  imageUrls: Array<string | null | undefined>;
  className?: string;
};

export function StockGroupThumb({ imageUrls, className }: StockGroupThumbProps) {
  const model = buildGroupThumbCollage(imageUrls);
  return (
    <GroupThumbFrame model={model} className={className} />
  );
}

export function GroupThumbFrame({
  model,
  className,
}: {
  model: GroupThumbCollageModel;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50",
        className,
      )}
      aria-hidden
    >
      {model.layout === "empty" ? (
        <Package size={18} className="text-gray-300" />
      ) : null}
      {model.layout === "single" ? (
        // eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e
        <img
          src={(model.slots[0] as { type: "image"; src: string }).src}
          alt=""
          className="h-full w-full object-contain p-0.5"
        />
      ) : null}
      {model.layout === "grid" ? (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-gray-200 p-px">
          {model.slots.map((slot, index) => (
            <div
              key={index}
              className="flex items-center justify-center overflow-hidden bg-gray-50"
            >
              {slot.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e
                <img
                  src={slot.src}
                  alt=""
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {model.overflowLabel ? (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-gray-900/80 px-1 text-[9px] font-semibold leading-4 text-white">
          {model.overflowLabel}
        </span>
      ) : null}
    </div>
  );
}
