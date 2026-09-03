"use client";

import { Image as ImageIcon, ImagePlus } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";

import { Label } from "@/components/ui/label";
import {
  MEDIA_FILE_ACCEPT,
  MEDIA_FILE_HINT,
  mediaDisplayUrl,
  uploadKitchenMedia,
  validateMediaFile,
  type MediaImage,
  type MediaPurpose,
  type MediaUploadTarget,
} from "@/lib/media-upload";
import { cn } from "@/lib/utils";

type FrameSize = "sm" | "md" | "wide" | "lg" | "cover";
type FieldLayout = "default" | "inline";

const FRAME_CLASSES: Record<FrameSize, string> = {
  sm: "h-20 w-20",
  md: "h-28 w-28",
  wide: "h-32 w-full max-w-[10rem] sm:h-32 sm:w-40",
  lg: "aspect-square h-auto w-full max-w-sm min-h-44",
  /** Dropzone okładki przepisu — pełna szerokość sekcji. */
  cover: "h-56 w-full sm:h-64",
};

type MediaImageFieldProps = {
  kitchenId: string;
  purpose: MediaPurpose;
  /** Wymagany dla okładki przepisu i zdjęcia kroku. */
  target?: MediaUploadTarget;
  currentImage: MediaImage | null;
  onUploaded: (mediaAssetId: string) => void | Promise<void>;
  onRemoved: () => void | Promise<void>;
  disabled?: boolean;
  label?: string;
  hint?: string;
  /** Nadpisuje etykietę przycisku wyboru (np. „Zmień okładkę”). */
  pickLabel?: string;
  size?: FrameSize;
  /** `inline` = układ z referencji create (96×96 + przycisk obok). */
  layout?: FieldLayout;
  onPreviewUrlChange?: (url: string | null) => void;
};

export function MediaImageField({
  kitchenId,
  purpose,
  target,
  currentImage,
  onUploaded,
  onRemoved,
  disabled = false,
  label = "Zdjęcie",
  hint = MEDIA_FILE_HINT,
  pickLabel: pickLabelProp,
  size = "md",
  layout = "default",
  onPreviewUrlChange,
}: MediaImageFieldProps) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreview) {
        URL.revokeObjectURL(localPreview);
      }
    };
  }, [localPreview]);

  const remoteUrl = mediaDisplayUrl(currentImage);
  const previewSrc = localPreview ?? remoteUrl;

  useEffect(() => {
    onPreviewUrlChange?.(previewSrc);
  }, [onPreviewUrlChange, previewSrc]);

  const hasImage = Boolean(previewSrc || currentImage);
  const busy = progress !== null || removing;

  function replacePreview(next: string | null) {
    setLocalPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return next;
    });
  }

  async function handleFile(file: File) {
    const validation = validateMediaFile(file);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setError(null);
    replacePreview(URL.createObjectURL(file));
    setProgress(0);
    try {
      const asset = await uploadKitchenMedia({
        kitchenId,
        file,
        purpose,
        target,
        onProgress: setProgress,
      });
      await onUploaded(asset.id);
    } catch (uploadError) {
      replacePreview(null);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Nie udało się wysłać zdjęcia.",
      );
    } finally {
      setProgress(null);
    }
  }

  async function handleRemove() {
    setError(null);
    setRemoving(true);
    try {
      await onRemoved();
      replacePreview(null);
    } catch (removeError) {
      if (
        removeError instanceof Error &&
        removeError.message === "ABORT_REMOVE"
      ) {
        return;
      }
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Nie udało się usunąć zdjęcia.",
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <ImageFieldShell
      label={label}
      hint={hint}
      previewSrc={previewSrc}
      size={size}
      layout={layout}
      disabled={disabled || busy}
      busyLabel={
        removing ? "Usuwanie…" : progress !== null ? "Wysyłanie…" : null
      }
      pickLabel={
        pickLabelProp ?? (hasImage ? "Zmień zdjęcie" : "Dodaj zdjęcie")
      }
      onPick={handleFile}
      onPickError={setError}
      onRemove={hasImage ? handleRemove : null}
      progress={progress}
      error={error}
    />
  );
}

type PendingImageFieldProps = {
  file: File | null;
  onFileSelected: (file: File | null) => void;
  label?: string;
  hint?: string;
  note?: ReactNode;
  disabled?: boolean;
  size?: FrameSize;
  layout?: FieldLayout;
  pickLabel?: string;
};

/**
 * Wybór pliku bez wysyłki — dla formularzy, w których cel wysyłki
 * (np. `recipeId` okładki) powstaje dopiero po zapisie.
 */
export function PendingImageField({
  file,
  onFileSelected,
  label = "Zdjęcie",
  hint = MEDIA_FILE_HINT,
  note,
  disabled = false,
  size = "md",
  layout = "default",
  pickLabel: pickLabelProp,
}: PendingImageFieldProps) {
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    if (!preview) {
      return;
    }
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <ImageFieldShell
      label={label}
      hint={hint}
      note={note}
      previewSrc={preview}
      size={size}
      layout={layout}
      disabled={disabled}
      busyLabel={null}
      pickLabel={pickLabelProp ?? (file ? "Zmień zdjęcie" : "Wybierz zdjęcie")}
      onPick={(selected) => {
        const validation = validateMediaFile(selected);
        if (!validation.ok) {
          setError(validation.message);
          return;
        }
        setError(null);
        onFileSelected(selected);
      }}
      onPickError={setError}
      onRemove={
        file
          ? () => {
              setError(null);
              onFileSelected(null);
            }
          : null
      }
      progress={null}
      error={error}
    />
  );
}

type ImageFieldShellProps = {
  label: string;
  hint?: string;
  note?: ReactNode;
  previewSrc: string | null;
  size: FrameSize;
  layout: FieldLayout;
  disabled: boolean;
  busyLabel: string | null;
  pickLabel: string;
  onPick: (file: File) => void | Promise<void>;
  onPickError: (message: string) => void;
  onRemove: (() => void | Promise<void>) | null;
  progress: number | null;
  error: string | null;
};

function ImageFieldShell({
  label,
  hint,
  note,
  previewSrc,
  size,
  layout,
  disabled,
  busyLabel,
  pickLabel,
  onPick,
  onPickError,
  onRemove,
  progress,
  error,
}: ImageFieldShellProps) {
  const inputId = `${useId()}-file`;
  const [dragOver, setDragOver] = useState(false);
  const stacked =
    layout === "default" &&
    (size === "lg" || size === "wide" || size === "cover");
  const inline = layout === "inline";
  const isCoverDropzone = size === "cover";

  function acceptDroppedFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) {
      onPickError("Nie wybrano pliku.");
      return;
    }
    void onPick(file);
  }

  if (inline) {
    return (
      <div>
        <label
          htmlFor={inputId}
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-gray-50",
              dragOver
                ? "border-emerald-400 bg-emerald-50/60"
                : "border-gray-300",
              !disabled && "cursor-pointer",
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!disabled) {
                setDragOver(true);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (!disabled) {
                setDragOver(true);
              }
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              if (disabled) {
                return;
              }
              acceptDroppedFile(event.dataTransfer.files);
            }}
            onClick={() => {
              if (!disabled) {
                document.getElementById(inputId)?.click();
              }
            }}
          >
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć
              <img
                src={previewSrc}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-gray-400" />
            )}
          </div>
          <div>
            <label
              htmlFor={inputId}
              className={cn(
                "inline-flex cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              {busyLabel ?? pickLabel}
            </label>
            <input
              id={inputId}
              type="file"
              accept={MEDIA_FILE_ACCEPT}
              className="sr-only"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) {
                  onPickError("Nie wybrano pliku.");
                  return;
                }
                void onPick(file);
              }}
            />
            {onRemove ? (
              <button
                type="button"
                className="ml-3 text-xs font-medium text-gray-500 hover:text-red-600 disabled:opacity-60"
                disabled={disabled}
                onClick={() => void onRemove()}
              >
                Usuń
              </button>
            ) : null}
            {progress !== null ? (
              <div
                className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-gray-100"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Postęp wysyłki zdjęcia"
              >
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            ) : null}
            {hint ? (
              <p className="mt-2 text-xs text-gray-500">{hint}</p>
            ) : null}
            {error ? (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div
        className={cn(
          "flex gap-3",
          stacked ? "flex-col" : "flex-col sm:flex-row sm:items-start",
        )}
      >
        <div
              className={cn(
                "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-stone-50 transition-all group",
                FRAME_CLASSES[size],
            dragOver
              ? "border-emerald-400 bg-emerald-50/30"
              : isCoverDropzone
                ? "border-stone-300 hover:border-emerald-400 hover:bg-emerald-50/30"
                : "border-gray-200",
            !disabled && "cursor-pointer",
          )}
          role={isCoverDropzone ? "button" : undefined}
          tabIndex={isCoverDropzone && !disabled ? 0 : undefined}
          aria-label={isCoverDropzone ? pickLabel : undefined}
          onKeyDown={
            isCoverDropzone
              ? (event) => {
                  if (disabled) {
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    document.getElementById(inputId)?.click();
                  }
                }
              : undefined
          }
          onDragEnter={(event) => {
            event.preventDefault();
            if (!disabled) {
              setDragOver(true);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) {
              setDragOver(true);
            }
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (disabled) {
              return;
            }
            acceptDroppedFile(event.dataTransfer.files);
          }}
          onClick={() => {
            if (!disabled) {
              document.getElementById(inputId)?.click();
            }
          }}
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- podpisane URL-e magazynu zdjęć
            <img
              src={previewSrc}
              alt=""
              className={cn(
                "h-full w-full",
                isCoverDropzone
                  ? "object-cover opacity-40 transition-opacity group-hover:opacity-20"
                  : "object-contain",
              )}
            />
          ) : null}
          {isCoverDropzone ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 shadow-sm">
                <ImageIcon className="h-6 w-6" aria-hidden />
              </div>
              <span className="font-medium text-stone-700">
                {busyLabel ?? pickLabel}
              </span>
              <span className="mt-1 text-xs text-stone-500">
                {hint ?? "Przeciągnij zdjęcie lub kliknij. Maks. 10MB"}
              </span>
            </div>
          ) : previewSrc ? null : (
            <div className="flex flex-col items-center gap-2 px-4 text-center">
              <ImagePlus size={28} className="text-gray-300" />
              {stacked ? (
                <p className="text-xs text-gray-400">
                  Przeciągnij zdjęcie albo kliknij, aby wybrać
                </p>
              ) : null}
            </div>
          )}
        </div>
        <div className={cn("min-w-0 flex-1 space-y-2", isCoverDropzone && "contents")}>
          {!isCoverDropzone ? (
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={inputId}
              className={cn(
                "inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700",
                disabled
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer hover:bg-gray-50",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              {busyLabel ?? pickLabel}
            </label>
            <input
              id={inputId}
              type="file"
              accept={MEDIA_FILE_ACCEPT}
              className="sr-only"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) {
                  onPickError("Nie wybrano pliku.");
                  return;
                }
                void onPick(file);
              }}
            />
            {onRemove ? (
              <button
                type="button"
                className="text-xs font-medium text-gray-500 hover:text-red-600 disabled:opacity-60"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  void onRemove();
                }}
              >
                Usuń zdjęcie
              </button>
            ) : null}
          </div>
          ) : (
            <>
              <input
                id={inputId}
                type="file"
                accept={MEDIA_FILE_ACCEPT}
                className="sr-only"
                disabled={disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) {
                    onPickError("Nie wybrano pliku.");
                    return;
                  }
                  void onPick(file);
                }}
              />
              {onRemove ? (
                <button
                  type="button"
                  className="text-xs font-medium text-stone-500 hover:text-red-600 disabled:opacity-60"
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    void onRemove();
                  }}
                >
                  Usuń okładkę
                </button>
              ) : null}
            </>
          )}
          {progress !== null ? (
            <div
              className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Postęp wysyłki zdjęcia"
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
          {hint && !isCoverDropzone ? (
            <p className="text-xs text-gray-400">{hint}</p>
          ) : null}
          {note ? <div className="text-xs text-gray-500">{note}</div> : null}
          {error ? (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
