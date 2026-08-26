"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

type ImageLightboxProps = {
  src: string;
  alt: string;
  caption?: string | null;
  onClose: () => void;
};

export function ImageLightbox({
  src,
  alt,
  caption,
  onClose,
}: ImageLightboxProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={caption ?? alt}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-full w-full max-w-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Zamknij podgląd"
          className="absolute -top-3 -right-3 rounded-full bg-white p-2 text-gray-600 shadow-md hover:text-gray-900"
          onClick={onClose}
        >
          <X size={16} />
        </button>
        <div className="flex max-h-[75vh] items-center justify-center overflow-hidden rounded-2xl bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć */}
          <img
            src={src}
            alt={alt}
            className="max-h-[70vh] w-auto max-w-full object-contain"
          />
        </div>
        {caption ? (
          <p className="mt-3 text-center text-sm text-white/90">{caption}</p>
        ) : null}
      </div>
    </div>
  );
}
