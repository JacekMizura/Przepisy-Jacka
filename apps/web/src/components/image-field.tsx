"use client";

import { ImagePlus } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fileToCompressedImageUrl } from "@/lib/product-media";

export function ImageField({
  id,
  label = "Zdjęcie",
  value,
  onChange,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const fileId = `${fieldId}-file`;
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote/data URLs from user input
            <img
              src={value}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ImagePlus size={22} className="text-gray-300" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            id={fieldId}
            type="text"
            inputMode="url"
            placeholder="https://… albo wgraj plik poniżej"
            value={value.startsWith("data:") ? "" : value}
            onChange={(event) => {
              setLocalError(null);
              onChange(event.target.value);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={fileId}
              className="inline-flex cursor-pointer items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {pending ? "Kompresja…" : "Wybierz plik"}
            </label>
            <input
              id={fileId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={pending}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) {
                  return;
                }
                setPending(true);
                setLocalError(null);
                try {
                  onChange(await fileToCompressedImageUrl(file));
                } catch (error) {
                  setLocalError(
                    error instanceof Error
                      ? error.message
                      : "Nie udało się wczytać zdjęcia.",
                  );
                } finally {
                  setPending(false);
                }
              }}
            />
            {value ? (
              <button
                type="button"
                className="text-xs font-medium text-gray-500 hover:text-red-600"
                onClick={() => {
                  setLocalError(null);
                  onChange("");
                }}
              >
                Usuń zdjęcie
              </button>
            ) : null}
          </div>
          {value.startsWith("data:") ? (
            <p className="text-xs text-gray-400">
              Wgrano lokalny plik (skompresowany podgląd).
            </p>
          ) : null}
          {localError ? (
            <p className="text-xs text-red-600" role="alert">
              {localError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
