"use client";

import { cn } from "@/lib/utils";
import {
  type PurchaseModeChoice,
} from "@/lib/purchase-mode";

export type { PurchaseModeChoice };

const CHOICES: Array<{
  value: PurchaseModeChoice;
  title: string;
  description: string;
}> = [
  {
    value: "packaged",
    title: "W opakowaniach",
    description:
      "Stała zawartość jednego opakowania, np. 125 g, 1 l albo 10 szt.",
  },
  {
    value: "exact",
    title: "Na wagę / luzem",
    description:
      "Przy każdym zakupie wpiszesz rzeczywistą wagę lub objętość. Bez stałego opakowania.",
  },
];

type PurchaseModeFieldProps = {
  value: PurchaseModeChoice | null;
  onChange: (next: PurchaseModeChoice) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function PurchaseModeField({
  value,
  onChange,
  disabled = false,
  className,
  id = "product-purchase-mode",
}: PurchaseModeFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <p id={`${id}-label`} className="block text-sm font-medium text-gray-700">
        Sposób zakupu
      </p>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="grid gap-2 sm:grid-cols-2"
      >
        {CHOICES.map((choice) => {
          const selected = value === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(choice.value)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                selected
                  ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200"
                  : "border-gray-200 bg-white hover:border-gray-300",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="block text-sm font-semibold text-gray-900">
                {choice.title}
              </span>
              <span className="mt-1 block text-xs leading-snug text-gray-600">
                {choice.description}
              </span>
            </button>
          );
        })}
      </div>
      {value === "exact" ? (
        <p className="text-xs text-gray-500">
          Bez stałego opakowania — ilość wpisujesz przy każdym zakupie.
        </p>
      ) : null}
    </div>
  );
}
