"use client";

import { Check, X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

type ToastProps = {
  message: string | null;
  onDismiss: () => void;
  variant?: "success" | "error" | "info";
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};

export function Toast({
  message,
  onDismiss,
  variant = "success",
  durationMs,
  actionLabel,
  onAction,
}: ToastProps) {
  const resolvedDuration =
    durationMs ?? (actionLabel && onAction ? 8000 : 3500);

  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(onDismiss, resolvedDuration);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, resolvedDuration]);

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
      <div className="min-w-0 flex-1 space-y-2">
        <p className="leading-snug">{message}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="text-xs font-semibold underline-offset-2 hover:underline"
            onClick={() => {
              onAction();
              onDismiss();
            }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
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
