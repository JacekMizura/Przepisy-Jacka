import type { components } from "@moja-kuchnia/api-client";

type ProductNutrition = components["schemas"]["ProductNutritionDto"];
export type UpsertProductNutrition =
  components["schemas"]["UpsertProductNutritionDto"];

export type NutritionBaseUnit = "piece" | "gram" | "milliliter";

/** Form draft for nutrition fields (shared shape with lookup apply handlers). */
export type NutritionFormDraft = {
  baseQuantity: string;
  baseUnit: NutritionBaseUnit;
  kcal: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
  fiberGrams: string;
  saltGrams: string;
  source: "manual" | "open_food_facts" | "usda_fdc";
  sourceFetchedAt: string | null;
  sourceLabel: string | null;
  sourceBrand: string | null;
  sourceGenericFoodId?: string | null;
  sourceFdcId?: number | null;
  sourcePieceGrams?: string | null;
};

const NUMBER_PATTERN = /^(?:0|[1-9]\d*)(?:[.,]\d{1,3})?$/;

function toApiQuantityString(value: string): string {
  const normalized = value.trim().replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return value.trim();
  }
  return numeric.toFixed(3);
}

function formatNutritionNumber(
  value: string | number | null | undefined,
  maximumFractionDigits = 1,
): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(numeric);
}

export function draftHasNutritionValues(values: {
  kcal: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
  fiberGrams?: string;
  saltGrams?: string;
}): boolean {
  return [
    values.kcal,
    values.proteinGrams,
    values.carbsGrams,
    values.fatGrams,
    values.fiberGrams ?? "",
    values.saltGrams ?? "",
  ].some((value) => value.trim().length > 0);
}

export function defaultBaseQuantityForUnit(unit: NutritionBaseUnit): string {
  return unit === "piece" ? "1" : "100";
}

export function createEmptyNutritionDraft(
  defaultUnit: NutritionBaseUnit,
): NutritionFormDraft {
  return {
    baseQuantity: defaultBaseQuantityForUnit(defaultUnit),
    baseUnit: defaultUnit,
    kcal: "",
    proteinGrams: "",
    carbsGrams: "",
    fatGrams: "",
    fiberGrams: "",
    saltGrams: "",
    source: "manual",
    sourceFetchedAt: null,
    sourceLabel: null,
    sourceBrand: null,
    sourceGenericFoodId: null,
    sourceFdcId: null,
    sourcePieceGrams: null,
  };
}

export function nutritionDraftFromDto(
  nutrition: ProductNutrition | null | undefined,
  defaultUnit: NutritionBaseUnit,
): NutritionFormDraft {
  if (!nutrition) {
    return createEmptyNutritionDraft(defaultUnit);
  }
  return {
    baseQuantity: formatNutritionNumber(nutrition.baseQuantity, 3),
    baseUnit: nutrition.baseUnit,
    kcal: formatNutritionNumber(nutrition.kcal, 3),
    proteinGrams: formatNutritionNumber(nutrition.proteinGrams, 3),
    carbsGrams: formatNutritionNumber(nutrition.carbsGrams, 3),
    fatGrams: formatNutritionNumber(nutrition.fatGrams, 3),
    fiberGrams: formatNutritionNumber(nutrition.fiberGrams, 3),
    saltGrams: formatNutritionNumber(nutrition.saltGrams, 3),
    source: nutrition.source,
    sourceFetchedAt: nutrition.sourceFetchedAt,
    sourceLabel: nutrition.sourceLabel,
    sourceBrand: nutrition.sourceBrand,
    sourceGenericFoodId: nutrition.sourceGenericFoodId ?? null,
    sourceFdcId: nutrition.sourceFdcId ?? null,
    sourcePieceGrams: nutrition.sourcePieceGrams
      ? formatNutritionNumber(nutrition.sourcePieceGrams, 3)
      : null,
  };
}

/** Clears OFF/USDA provenance after a manual field edit. */
export function clearNutritionProvenance(
  draft: NutritionFormDraft,
): NutritionFormDraft {
  return {
    ...draft,
    source: "manual",
    sourceFetchedAt: null,
    sourceLabel: null,
    sourceBrand: null,
    sourceGenericFoodId: null,
    sourceFdcId: null,
    sourcePieceGrams: null,
  };
}

type ParsedNumber<T> = { ok: true; value: T } | { ok: false; message: string };

function invalidNumberMessage(fieldLabel: string): string {
  return `Pole „${fieldLabel}” musi być liczbą nieujemną z maksymalnie 3 miejscami po przecinku.`;
}

function parseRequiredNumber(
  raw: string,
  fieldLabel: string,
): ParsedNumber<string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: `Podaj ${fieldLabel}.` };
  }
  if (!NUMBER_PATTERN.test(trimmed)) {
    return { ok: false, message: invalidNumberMessage(fieldLabel) };
  }
  return { ok: true, value: toApiQuantityString(trimmed) };
}

function parseOptionalNumber(
  raw: string,
  fieldLabel: string,
): ParsedNumber<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (!NUMBER_PATTERN.test(trimmed)) {
    return { ok: false, message: invalidNumberMessage(fieldLabel) };
  }
  return { ok: true, value: toApiQuantityString(trimmed) };
}

export type BuildNutritionResult =
  | { ok: true; value: UpsertProductNutrition | undefined }
  | { ok: false; message: string };

/**
 * Empty nutrition → `undefined` (do not send zeros).
 * Incomplete filled form → validation error.
 */
export function buildUpsertProductNutritionDto(
  draft: NutritionFormDraft | null | undefined,
): BuildNutritionResult {
  if (!draft || !draftHasNutritionValues(draft)) {
    return { ok: true, value: undefined };
  }

  const baseQuantity = parseRequiredNumber(
    draft.baseQuantity,
    "ilość odniesienia",
  );
  if (!baseQuantity.ok) {
    return baseQuantity;
  }
  if (Number(baseQuantity.value) <= 0) {
    return {
      ok: false,
      message: "Ilość odniesienia musi być większa od zera.",
    };
  }
  const kcal = parseRequiredNumber(draft.kcal, "kcal");
  if (!kcal.ok) {
    return kcal;
  }
  const protein = parseRequiredNumber(draft.proteinGrams, "białko");
  if (!protein.ok) {
    return protein;
  }
  const carbs = parseRequiredNumber(draft.carbsGrams, "węglowodany");
  if (!carbs.ok) {
    return carbs;
  }
  const fat = parseRequiredNumber(draft.fatGrams, "tłuszcz");
  if (!fat.ok) {
    return fat;
  }
  const fiber = parseOptionalNumber(draft.fiberGrams, "błonnik");
  if (!fiber.ok) {
    return fiber;
  }
  const salt = parseOptionalNumber(draft.saltGrams, "sól");
  if (!salt.ok) {
    return salt;
  }

  return {
    ok: true,
    value: {
      baseQuantity: baseQuantity.value,
      baseUnit: draft.baseUnit,
      kcal: kcal.value,
      proteinGrams: protein.value,
      carbsGrams: carbs.value,
      fatGrams: fat.value,
      fiberGrams: fiber.value,
      saltGrams: salt.value,
      source: draft.source,
      sourceFetchedAt: draft.sourceFetchedAt,
      sourceLabel: draft.sourceLabel,
      sourceBrand: draft.sourceBrand,
      sourceGenericFoodId: draft.sourceGenericFoodId ?? null,
      sourceFdcId: draft.sourceFdcId ?? null,
      sourcePieceGrams: draft.sourcePieceGrams ?? null,
    },
  };
}
