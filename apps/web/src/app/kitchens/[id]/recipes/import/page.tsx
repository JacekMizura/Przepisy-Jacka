"use client";

import type { components } from "@moja-kuchnia/api-client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app-shell";
import {
  RecipeForm,
  type RecipeFormMedia,
  type RecipeFormValues,
} from "@/components/recipe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { uploadKitchenMedia } from "@/lib/media-upload";
import {
  buildImportCreatePayload,
  candidateToRecipeDetailDraft,
  collectImportWarnings,
  type ImportReviewState,
} from "@/lib/recipe-import";
import { cn } from "@/lib/utils";

type Preview = components["schemas"]["RecipeImportPreviewDto"];
type ImportMode = "url" | "text";

export default function ImportRecipePage() {
  const params = useParams<{ id: string }>();
  const kitchenId = params.id;
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [textSourceUrl, setTextSourceUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [review, setReview] = useState<ImportReviewState | null>(null);

  const productsQuery = useQuery({
    queryKey: ["products", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/products",
        { params: { path: { kitchenId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać produktów."));
      }
      return data ?? [];
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const body =
        mode === "url"
          ? { mode: "url" as const, url: url.trim() }
          : {
              mode: "text" as const,
              text,
              ...(textSourceUrl.trim()
                ? { sourceUrl: textSourceUrl.trim() }
                : {}),
            };
      const { data, error, response } = await client.POST(
        "/api/kitchens/{kitchenId}/recipes/import/preview",
        {
          params: { path: { kitchenId } },
          body,
        },
      );
      if (response.status === 401) {
        throw new Error("Musisz być zalogowany, aby importować przepisy.");
      }
      if (error || !data) {
        throw new Error(
          readApiError(error, "Nie udało się odczytać przepisu."),
        );
      }
      return data;
    },
    onSuccess: (data) => {
      setPreview(data);
      setSelectedIndex(0);
      setReview(null);
      if (data.suggestPasteCaption && data.candidates.length === 0) {
        setMode("text");
        setTextSourceUrl(data.sourceUrl ?? url.trim());
        return;
      }
      if (data.candidates.length === 1) {
        setReview({
          sourceUrl: data.sourceUrl,
          importIdempotencyKey: data.importIdempotencyKey,
          importedAt: data.importedAt,
          candidate: data.candidates[0]!,
          existingFromSameSource: data.existingFromSameSource,
          extractionMethod: data.extractionMethod,
          fromUrlFetch: data.fromUrlFetch,
        });
      }
    },
  });

  const createRecipe = useMutation({
    mutationFn: async ({
      body,
      media,
    }: {
      body: RecipeFormValues;
      media: RecipeFormMedia;
    }) => {
      if (!review) {
        throw new Error("Brak podglądu importu.");
      }
      const client = createWebApiClient();
      const payload = buildImportCreatePayload(body, review);
      const { data, error } = await client.POST(
        "/api/kitchens/{kitchenId}/recipes",
        {
          params: { path: { kitchenId } },
          body: payload,
        },
      );
      if (error || !data) {
        throw new Error(readApiError(error, "Nie udało się zapisać przepisu."));
      }

      if (media.coverFile) {
        const asset = await uploadKitchenMedia({
          kitchenId,
          file: media.coverFile,
          purpose: "recipe_cover",
          target: { recipeId: data.id },
        });
        await client.POST(
          "/api/kitchens/{kitchenId}/recipes/{recipeId}/cover",
          {
            params: { path: { kitchenId, recipeId: data.id } },
            body: { mediaAssetId: asset.id },
          },
        );
      }

      return data;
    },
    onSuccess: (recipe) => {
      router.push(`/kitchens/${kitchenId}/recipes/${recipe.id}`);
    },
  });

  const warnings = useMemo(
    () => (review ? collectImportWarnings(review.candidate) : []),
    [review],
  );

  const initialRecipe = useMemo(
    () => (review ? candidateToRecipeDetailDraft(kitchenId, review) : null),
    [kitchenId, review],
  );

  const canSubmitPreview =
    mode === "url" ? Boolean(url.trim()) : Boolean(text.trim());

  return (
    <AppShell kitchenId={kitchenId}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Importuj przepis
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Z linku (JSON-LD, microdata, HTML) albo z wklejonego tekstu.
              Podgląd nic nie zapisuje — przepis powstaje dopiero po „Zapisz
              przepis”.
            </p>
          </div>
          <Link href={`/kitchens/${kitchenId}/recipes`}>
            <Button variant="outline">Anuluj</Button>
          </Link>
        </header>

        <section className="space-y-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "url" ? "default" : "outline"}
              onClick={() => setMode("url")}
            >
              Z linku
            </Button>
            <Button
              type="button"
              variant={mode === "text" ? "default" : "outline"}
              onClick={() => setMode("text")}
            >
              Wklej tekst
            </Button>
          </div>

          {mode === "url" ? (
            <div className="space-y-2">
              <Label htmlFor="import-url">Adres HTTPS przepisu</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="import-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://…"
                  className="flex-1"
                />
                <Button
                  type="button"
                  disabled={previewMutation.isPending || !canSubmitPreview}
                  onClick={() => previewMutation.mutate()}
                >
                  {previewMutation.isPending
                    ? "Pobieranie…"
                    : "Odczytaj przepis"}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Instagram i TikTok: jeśli automatyczny odczyt nie wystarczy,
                użyj „Wklej tekst” z opisem posta.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="import-text">Tekst przepisu lub opis posta</Label>
                <textarea
                  id="import-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={12}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  placeholder={"Tytuł\n\nSkładniki\n…\n\nPrzygotowanie\n…"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="import-text-source">
                  Adres źródła (opcjonalnie)
                </Label>
                <Input
                  id="import-text-source"
                  value={textSourceUrl}
                  onChange={(event) => setTextSourceUrl(event.target.value)}
                  placeholder="https://…"
                />
              </div>
              <Button
                type="button"
                disabled={previewMutation.isPending || !canSubmitPreview}
                onClick={() => previewMutation.mutate()}
              >
                {previewMutation.isPending
                  ? "Analizowanie…"
                  : "Odczytaj z tekstu"}
              </Button>
            </div>
          )}

          {previewMutation.isError ? (
            <p className="text-sm text-red-600" role="alert">
              {readApiError(previewMutation.error)}
            </p>
          ) : null}

          {preview?.suggestPasteCaption && preview.candidates.length === 0 ? (
            <p className="text-sm text-amber-800" role="status">
              Nie udało się automatycznie odczytać pełnego przepisu z tego linku
              (Instagram/TikTok). Wklej opis posta poniżej — adres źródła został
              zachowany.
            </p>
          ) : null}
        </section>

        {preview && preview.candidates.length > 1 && !review ? (
          <section className="space-y-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Na stronie jest kilka przepisów
            </h2>
            <ul className="space-y-2">
              {preview.candidates.map((candidate) => (
                <li key={candidate.index}>
                  <button
                    type="button"
                    onClick={() => setSelectedIndex(candidate.index)}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                      selectedIndex === candidate.index
                        ? "border-emerald-600 bg-emerald-50"
                        : "border-gray-200 hover:bg-gray-50",
                    )}
                  >
                    <span className="font-semibold text-gray-900">
                      {candidate.name}
                    </span>
                    {candidate.description ? (
                      <span className="mt-1 block text-gray-500 line-clamp-2">
                        {candidate.description}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              onClick={() => {
                const candidate = preview.candidates.find(
                  (item) => item.index === selectedIndex,
                );
                if (!candidate) return;
                setReview({
                  sourceUrl: preview.sourceUrl,
                  importIdempotencyKey: preview.importIdempotencyKey,
                  importedAt: preview.importedAt,
                  candidate,
                  existingFromSameSource: preview.existingFromSameSource,
                  extractionMethod: preview.extractionMethod,
                  fromUrlFetch: preview.fromUrlFetch,
                });
              }}
            >
              Dalej do podglądu
            </Button>
          </section>
        ) : null}

        {review && initialRecipe && productsQuery.isSuccess ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Metoda: {review.extractionMethod ?? "—"}
              {review.fromUrlFetch
                ? " · automatyczny import z linku"
                : " · tekst wklejony przez użytkownika"}
            </p>

            {review.existingFromSameSource.length > 0 ? (
              <div
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                role="status"
              >
                Masz już przepis z tego źródła:{" "}
                {review.existingFromSameSource
                  .map((item) => item.name)
                  .join(", ")}
                . Możesz kontynuować, jeśli chcesz kolejną kopię.
              </div>
            ) : null}

            {warnings.length > 0 ? (
              <div
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                role="status"
              >
                <p className="font-semibold">Braki i niepewne dane</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {(review.candidate.unassignedFragments?.length ?? 0) > 0 ? (
              <div
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                role="status"
              >
                <p className="font-semibold">
                  Fragmenty do ręcznego opracowania
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {review.candidate.unassignedFragments!.map((fragment) => (
                    <li key={fragment.slice(0, 80)}>{fragment}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {review.sourceUrl ? (
              <p className="text-sm text-gray-500">
                Źródło:{" "}
                <a
                  href={review.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 underline"
                >
                  {review.sourceUrl}
                </a>
                {review.candidate.sourceAuthor
                  ? ` · Autor źródła: ${review.candidate.sourceAuthor}`
                  : null}
              </p>
            ) : null}

            <RecipeForm
              key={`${review.importIdempotencyKey}-${review.candidate.index}`}
              kitchenId={kitchenId}
              products={productsQuery.data}
              initialRecipe={initialRecipe}
              forceCreateMode
              submitLabel="Zapisz przepis"
              pending={createRecipe.isPending}
              onSubmit={(body, media) => createRecipe.mutate({ body, media })}
            />
            {createRecipe.isError ? (
              <p className="text-sm text-red-600" role="alert">
                {readApiError(createRecipe.error)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
