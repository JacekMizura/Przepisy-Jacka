"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export type ProductActionItem =
  | {
      id: string;
      label: string;
      onSelect: () => void;
      destructive?: boolean;
      disabled?: boolean;
    }
  | {
      id: string;
      label: string;
      href: string;
      destructive?: boolean;
      disabled?: boolean;
    };

type ProductActionsMenuProps = {
  label: string;
  items: ProductActionItem[];
  className?: string;
};

export function ProductActionsMenu({
  label,
  items,
  className,
}: ProductActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const enabledItems = items.filter((item) => !item.disabled);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const first = menuRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])',
    );
    first?.focus();
  }, [open]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );
    if (nodes.length === 0) {
      return;
    }
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = nodes[(index + 1) % nodes.length];
      next?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = nodes[(index - 1 + nodes.length) % nodes.length];
      next?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      nodes[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  if (enabledItems.length === 0) {
    return null;
  }

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          className="absolute right-0 z-40 mt-1 min-w-[12.5rem] rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => {
            if (item.disabled) {
              return null;
            }
            const className = cn(
              "block w-full px-3 py-2 text-left text-sm focus:bg-emerald-50 focus:outline-none",
              item.destructive
                ? "text-red-700 hover:bg-red-50"
                : "text-gray-800 hover:bg-gray-50",
            );
            if ("href" in item) {
              return (
                <Link
                  key={item.id}
                  role="menuitem"
                  href={item.href}
                  className={className}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={className}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function MenuDivider(): ReactNode {
  return <div role="separator" className="my-1 border-t border-gray-100" />;
}
