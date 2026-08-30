"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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

const VIEWPORT_GAP = 8;
const MENU_MIN_WIDTH = 200;

type MenuCoords = {
  top: number;
  left: number;
  maxHeight: number;
};

function computeMenuPosition(button: DOMRect, menuHeight: number): MenuCoords {
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const spaceBelow = viewportH - button.bottom - VIEWPORT_GAP;
  const spaceAbove = button.top - VIEWPORT_GAP;
  const preferBelow = spaceBelow >= Math.min(menuHeight, 120) || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(
    120,
    preferBelow ? spaceBelow : spaceAbove,
  );
  const height = Math.min(menuHeight, maxHeight);
  const top = preferBelow
    ? button.bottom + 4
    : Math.max(VIEWPORT_GAP, button.top - height - 4);
  const width = Math.max(MENU_MIN_WIDTH, button.width);
  let left = button.right - width;
  left = Math.min(left, viewportW - width - VIEWPORT_GAP);
  left = Math.max(VIEWPORT_GAP, left);
  return { top, left, maxHeight };
}

export function ProductActionsMenu({
  label,
  items,
  className,
}: ProductActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const enabledItems = items.filter((item) => !item.disabled);

  const close = useCallback(() => {
    setOpen(false);
    setCoords(null);
    buttonRef.current?.focus();
  }, []);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) {
      return;
    }
    const measured = menu.getBoundingClientRect().height || 160;
    setCoords(computeMenuPosition(button.getBoundingClientRect(), measured));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    updatePosition();
  }, [open, updatePosition, enabledItems.length]);

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
      setCoords(null);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    function onReposition() {
      updatePosition();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [close, open, updatePosition]);

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
      setCoords(null);
    }
  }

  if (enabledItems.length === 0) {
    return null;
  }

  const menuStyle: CSSProperties | undefined = coords
    ? {
        position: "fixed",
        top: coords.top,
        left: coords.left,
        maxHeight: coords.maxHeight,
        minWidth: MENU_MIN_WIDTH,
        zIndex: 80,
      }
    : {
        position: "fixed",
        top: -9999,
        left: -9999,
        visibility: "hidden",
        zIndex: 80,
      };

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          data-testid="product-actions-menu-portal"
          className="overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          style={menuStyle}
          onKeyDown={onMenuKeyDown}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {items.map((item) => {
            if (item.disabled) {
              return null;
            }
            const itemClass = cn(
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
                  className={itemClass}
                  onClick={() => {
                    setOpen(false);
                    setCoords(null);
                  }}
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
                className={itemClass}
                onClick={() => {
                  setOpen(false);
                  setCoords(null);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )
    : null;

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
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {menu}
    </div>
  );
}

export function MenuDivider(): ReactNode {
  return <div role="separator" className="my-1 border-t border-gray-100" />;
}
