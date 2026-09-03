"use client";

import {
  ArrowLeft,
  Calendar,
  Link2,
  Lock,
  MoreVertical,
  Pencil,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { RECIPE_VISIBILITY_LABELS } from "@/lib/recipe-labels";

type Category = { id: string; name: string };
type Author = { id: string; name: string };
type Visibility = keyof typeof RECIPE_VISIBILITY_LABELS;

type RecipeDetailHeroProps = {
  kitchenId: string;
  coverUrl: string | null;
  recipeName: string;
  description: string | null;
  categories: Category[];
  visibility: Visibility;
  author: Author;
  createdAt: string;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  isAuthor: boolean;
  editHref: string;
  onBack: () => void;
  onShare: () => void;
  onDelete: () => void;
  onPreviewCover: (src: string, alt: string) => void;
};

export function RecipeDetailHero({
  kitchenId,
  coverUrl,
  recipeName,
  description,
  categories,
  visibility,
  author,
  createdAt,
  sourceUrl,
  sourceAuthor,
  isAuthor,
  editHref,
  onBack,
  onShare,
  onDelete,
  onPreviewCover,
}: RecipeDetailHeroProps) {
  const primaryCategory = categories[0]?.name ?? null;
  const dateLabel = new Date(createdAt).toLocaleDateString("pl-PL");
  const sourceLabel = sourceAuthor?.trim() || null;

  return (
    <div
      className={cn(
        "recipe-print-hide relative -mx-4 flex w-[calc(100%+2rem)] flex-col justify-end overflow-hidden md:-mx-8 md:w-[calc(100%+4rem)] lg:-mx-10 lg:w-[calc(100%+5rem)]",
        "h-[min(40vh,500px)] min-h-[300px] max-h-[480px] sm:min-h-[350px]",
      )}
      data-testid="recipe-detail-hero"
    >
      {coverUrl ? (
        <button
          type="button"
          className="absolute inset-0 block h-full w-full cursor-zoom-in"
          onClick={() => onPreviewCover(coverUrl, recipeName)}
          aria-label="Powiększ okładkę przepisu"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu */}
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </button>
      ) : (
        <div
          className="absolute inset-0 bg-gradient-to-br from-stone-700 via-stone-800 to-emerald-950"
          aria-hidden
        >
          <div className="absolute inset-0 opacity-40 mix-blend-overlay [background-image:radial-gradient(circle_at_20%_20%,white,transparent_45%),radial-gradient(circle_at_80%_60%,#86efac,transparent_40%)]" />
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/70"
        aria-hidden
      />

      <div className="absolute top-0 left-0 z-20 flex w-full items-center justify-between p-4 lg:p-8">
        <button
          type="button"
          onClick={onBack}
          aria-label="Wróć do listy przepisów"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/20 text-white backdrop-blur-md transition-all hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onShare}
            aria-label="Udostępnij przepis"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/20 text-white backdrop-blur-md transition-all hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            <Share2 size={18} aria-hidden />
          </button>
          {isAuthor ? (
            <HeroMoreMenu
              editHref={editHref}
              onDelete={onDelete}
            />
          ) : null}
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl p-6 lg:p-12 lg:pb-16">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {primaryCategory ? (
            <span className="rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-bold tracking-wider text-white uppercase shadow-sm backdrop-blur-sm">
              {primaryCategory}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
            {visibility === "private" ? (
              <Lock size={10} aria-hidden />
            ) : (
              <Users size={10} aria-hidden />
            )}
            {RECIPE_VISIBILITY_LABELS[visibility]}
          </span>
        </div>

        <h1 className="font-serif mb-4 text-3xl leading-tight text-white drop-shadow-md sm:text-4xl md:text-5xl lg:text-6xl">
          {recipeName}
        </h1>

        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed font-light text-white/90 drop-shadow md:text-base">
            {description}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-white/80">
          <div className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/50 bg-emerald-500 text-[10px] font-bold text-white"
              aria-hidden
            >
              {authorInitials(author.name)}
            </span>
            <span>{author.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar size={14} aria-hidden />
            <span>{dateLabel}</span>
          </div>
          {sourceUrl ? (
            <div className="flex items-center gap-1.5">
              <Link2 size={14} aria-hidden />
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 decoration-white/30 transition-all hover:text-white hover:decoration-white"
              >
                {sourceLabel ? `Źródło: ${sourceLabel}` : "Źródło przepisu"}
              </a>
            </div>
          ) : sourceLabel ? (
            <div className="flex items-center gap-1.5">
              <Link2 size={14} aria-hidden />
              <span>Źródło: {sourceLabel}</span>
            </div>
          ) : null}
        </div>
      </div>

      <span className="sr-only">
        Przepis w kuchni {kitchenId}
      </span>
    </div>
  );
}

function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 1).toUpperCase();
  }
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

function HeroMoreMenu({
  editHref,
  onDelete,
}: {
  editHref: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [coords, setCoords] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({
      position: "fixed",
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
      zIndex: 80,
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Więcej opcji"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/20 text-white backdrop-blur-md transition-all hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        <MoreVertical size={18} aria-hidden />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              style={coords}
              className="w-48 overflow-hidden rounded-xl border border-stone-100 bg-white py-1 shadow-lg"
              data-testid="recipe-hero-more-menu"
            >
              <Link
                href={editHref}
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-stone-700 hover:bg-stone-50"
                onClick={() => setOpen(false)}
              >
                <Pencil size={14} aria-hidden />
                Edytuj
              </Link>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                <Trash2 size={14} aria-hidden />
                Usuń przepis
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
