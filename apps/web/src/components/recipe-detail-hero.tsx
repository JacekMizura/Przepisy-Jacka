"use client";

type RecipeDetailHeroProps = {
  coverUrl: string | null;
  recipeName: string;
  onPreview: (src: string, alt: string) => void;
};

export function RecipeDetailHero({
  coverUrl,
  recipeName,
  onPreview,
}: RecipeDetailHeroProps) {
  if (!coverUrl) {
    return (
      <div
        className="recipe-print-hide relative -mx-4 mb-8 h-40 w-[calc(100%+2rem)] overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-700 to-stone-800 sm:h-52 md:-mx-8 md:w-[calc(100%+4rem)] lg:-mx-10 lg:w-[calc(100%+5rem)]"
        aria-hidden
      >
        <div className="absolute inset-0 opacity-30 mix-blend-overlay [background-image:radial-gradient(circle_at_20%_20%,white,transparent_45%),radial-gradient(circle_at_80%_60%,#a7f3d0,transparent_40%)]" />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="group relative -mx-4 mb-8 block w-[calc(100%+2rem)] overflow-hidden bg-stone-900 text-left md:-mx-8 md:w-[calc(100%+4rem)] lg:-mx-10 lg:w-[calc(100%+5rem)]"
      onClick={() => onPreview(coverUrl, recipeName)}
      aria-label="Powiększ okładkę przepisu"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć */}
      <img
        src={coverUrl}
        alt={`Okładka przepisu ${recipeName}`}
        className="h-56 w-full object-cover transition duration-500 group-hover:scale-[1.02] sm:h-72 lg:h-[22rem]"
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />
    </button>
  );
}
