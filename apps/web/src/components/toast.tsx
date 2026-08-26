"use client";

import { Check, X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

type ToastProps = {
  message: string | null;
  onDismiss: () => void;
  variant?: "success" | "error" | "info";
  durationMs?: number;
};

export function Toast({
  message,
  onDismiss,
  variant = "success",
  durationMs = 3500,
}: ToastProps) {
  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, durationMs]);

  if (!message) {
    return null;
  }

  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-4 right-4 z-[60] flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg",
        variant === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-900",
        variant === "error" && "border-red-200 bg-red-50 text-red-900",
        variant === "info" && "border-gray-200 bg-white text-gray-900",
      )}
    >
      {variant === "success" ? (
        <Check size={16} className="mt-0.5 shrink-0" />
      ) : null}
      <p className="flex-1 leading-snug">{message}</p>
      <button
        type="button"
        aria-label="Zamknij"
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
        onClick={onDismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}
