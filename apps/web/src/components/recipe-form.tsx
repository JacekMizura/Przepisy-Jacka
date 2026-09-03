"use client";

import type { components } from "@moja-kuchnia/api-client";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Flame,
  GripVertical,
  ImagePlus,
  Info,
  Lightbulb,
  ListOrdered,
  Plus,
  ShoppingBasket,
  Trash2,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { PendingImageField } from "@/components/media-image-field";
import { RecipeCategoryPicker } from "@/components/recipe-category-picker";
import { RecipeIngredientProductLink } from "@/components/recipe-ingredient-product-link";
import {
  RecipeCoverField,
  RecipeStepImageField,
} from "@/components/recipe-media-fields";
import { RecipeStepIngredientPicker } from "@/components/recipe-step-ingredient-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { readApiError } from "@/lib/errors";
import { formatQuantityNumber, toApiQuantityString } from "@/lib/format-quantity";
import type { MediaImage } from "@/lib/media-upload";
import {
  RECIPE_DIFFICULTY_LABELS,
  RECIPE_INGREDIENT_UNIT_LABELS,
  RECIPE_VISIBILITY_LABELS,
} from "@/lib/recipe-labels";
import { cn } from "@/lib/utils";

type Product = components["schemas"]["ProductDto"];
type RecipeDetail = components["schemas"]["RecipeDetailDto"];
type CreateRecipeDto = components["schemas"]["CreateRecipeDto"];
type IngredientUnit = components["schemas"]["RecipeIngredientInputDto"]["unit"];

export type RecipeFormValues = CreateRecipeDto;

type IngredientGroupDraft = {
  key: string;
  id: string;
  name: string;
};

type IngredientDraft = {
  key: string;
  id?: string;
  name: string;
  quantity: string;
  unit: IngredientUnit;
  note: string;
  productId: string;
  groupId: string | null;
};

type StepDraft = {
  key: string;
  title: string;
  instruction: string;
  tip: string;
  showTip: boolean;
  durationMinutes: string;
  /** Klucze składników formularza przypisane do kroku. */
  ingredientIds: string[];
  /** Ustawione tylko dla kroków już zapisanych w API — warunek wysyłki zdjęcia. */
  stepId?: string;
  image?: MediaImage | null;
  /** Plik wybrany przy tworzeniu — wysyłka po zapisie przepisu. */
  pendingImageFile?: File | null;
};

export type RecipeFormMedia = {
  coverFile: File | null;
  /** Pliki zdjęć w kolejności znormalizowanych kroków (po odfiltrowaniu pustych). */
  stepFiles: Array<File | null>;
};

type RecipeFormProps = {
  kitchenId: string;
  products: Product[];
  initialRecipe?: RecipeDetail;
  /** Import / nowy przepis — nie traktuj initialRecipe.id jako istniejącego zapisu. */
  forceCreateMode?: boolean;
  submitLabel: string;
  pending?: boolean;
  formId?: string;
  hideSubmit?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSubmit: (body: RecipeFormValues, media: RecipeFormMedia) => void;
};

const FORM_INPUT_CLASS =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-800 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] transition-all placeholder:text-stone-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none";

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function createIngredientDraft(
  partial?: Partial<IngredientDraft> & { key?: string },
): IngredientDraft {
  const id = partial?.id;
  return {
    key: partial?.key ?? id ?? crypto.randomUUID(),
    ...(id ? { id } : {}),
    name: partial?.name ?? "",
    quantity: partial?.quantity ?? "",
    unit: partial?.unit ?? "piece",
    note: partial?.note ?? "",
    productId: partial?.productId ?? "",
    groupId: partial?.groupId ?? null,
  };
}

function createGroupDraft(
  partial?: Partial<IngredientGroupDraft> & { key?: string; id?: string },
): IngredientGroupDraft {
  const id = partial?.id ?? crypto.randomUUID();
  return {
    key: partial?.key ?? id,
    id,
    name: partial?.name ?? "",
  };
}

function createStepDraft(partial?: Partial<StepDraft> & { key?: string }): StepDraft {
  const tip = partial?.tip ?? "";
  return {
    key: partial?.key ?? crypto.randomUUID(),
    title: partial?.title ?? "",
    instruction: partial?.instruction ?? "",
    tip,
    showTip: partial?.showTip ?? tip.trim().length > 0,
    durationMinutes: partial?.durationMinutes ?? "",
    ingredientIds: partial?.ingredientIds ? [...partial.ingredientIds] : [],
    ...(partial?.stepId ? { stepId: partial.stepId } : {}),
    ...(partial?.image !== undefined ? { image: partial.image } : {}),
  };
}

function recipeToDraft(recipe: RecipeDetail): {
  name: string;
  description: string;
  servings: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  difficulty: CreateRecipeDto["difficulty"];
  tags: string[];
  visibility: CreateRecipeDto["visibility"];
  sourceUrl: string;
  sourceAuthor: string;
  categoryIds: string[];
  ingredientGroups: IngredientGroupDraft[];
  ingredients: IngredientDraft[];
  steps: StepDraft[];
} {
  const detail = recipe;
  const groups = [...detail.ingredientGroups].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  return {
    name: recipe.name,
    description: recipe.description ?? "",
    servings: String(recipe.servings),
    prepTimeMinutes:
      recipe.prepTimeMinutes !== null ? String(recipe.prepTimeMinutes) : "",
    cookTimeMinutes:
      recipe.cookTimeMinutes !== null ? String(recipe.cookTimeMinutes) : "",
    difficulty: recipe.difficulty,
    tags: [...recipe.tags],
    visibility: recipe.visibility,
    sourceUrl: recipe.sourceUrl ?? "",
    sourceAuthor: recipe.sourceAuthor ?? "",
    categoryIds: (recipe.categories ?? []).map((category) => category.id),
    ingredientGroups: groups.map((group) =>
      createGroupDraft({ id: group.id, name: group.name }),
    ),
    ingredients:
      detail.ingredients.length > 0
        ? detail.ingredients
            .slice()
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((ingredient) =>
              createIngredientDraft({
                key: ingredient.id,
                id: ingredient.id,
                name: ingredient.name,
                quantity: formatQuantityNumber(ingredient.quantity ?? ""),
                unit: ingredient.unit,
                note: ingredient.note ?? "",
                productId: ingredient.productId ?? "",
                groupId: ingredient.groupId ?? null,
              }),
            )
        : [createIngredientDraft()],
    steps:
      detail.steps.length > 0
        ? detail.steps
            .slice()
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((step) =>
              createStepDraft({
                key: step.id,
                title: step.title ?? "",
                instruction: step.instruction,
                tip: step.tip ?? "",
                durationMinutes:
                  step.durationMinutes !== null
                    ? String(step.durationMinutes)
                    : "",
                ingredientIds: [...(step.ingredientIds ?? [])],
                stepId: step.id,
                image: step.image,
              }),
            )
        : [createStepDraft()],
  };
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) {
    return items;
  }
  const next = [...items];
  const current = next[index];
  const swap = next[target];
  if (current === undefined || swap === undefined) {
    return items;
  }
  next[index] = swap;
  next[target] = current;
  return next;
}

function reorderByIndex<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [removed] = next.splice(from, 1);
  if (removed === undefined) {
    return items;
  }
  next.splice(to, 0, removed);
  return next;
}

const QUANTITY_OPTIONAL_UNITS = new Set<IngredientUnit>(["pinch", "to_taste"]);

function ingredientHasContent(ingredient: IngredientDraft): boolean {
  return Boolean(
    ingredient.id ||
      ingredient.name.trim() ||
      ingredient.quantity.trim() ||
      ingredient.note.trim() ||
      ingredient.productId,
  );
}

function stepHasContent(step: StepDraft): boolean {
  return Boolean(
    step.stepId ||
      step.title.trim() ||
      step.instruction.trim() ||
      step.tip.trim() ||
      step.durationMinutes.trim() ||
      step.pendingImageFile ||
      step.image,
  );
}

export function RecipeForm({
  kitchenId,
  products,
  initialRecipe,
  forceCreateMode = false,
  submitLabel,
  pending: pendingSubmit,
  formId = "recipe-form",
  hideSubmit = false,
  onDirtyChange,
  onSubmit,
}: RecipeFormProps) {
  const initial = useMemo(
    () =>
      initialRecipe
        ? recipeToDraft(initialRecipe)
        : {
            name: "",
            description: "",
            servings: "1",
            prepTimeMinutes: "",
            cookTimeMinutes: "",
            difficulty: "easy" as const,
            tags: [] as string[],
            visibility: "private" as const,
            sourceUrl: "",
            sourceAuthor: "",
            categoryIds: [] as string[],
            ingredientGroups: [] as IngredientGroupDraft[],
            ingredients: [createIngredientDraft()],
            steps: [createStepDraft()],
          },
    [initialRecipe],
  );

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [servings, setServings] = useState(initial.servings);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(initial.prepTimeMinutes);
  const [cookTimeMinutes, setCookTimeMinutes] = useState(initial.cookTimeMinutes);
  const [difficulty, setDifficulty] =
    useState<CreateRecipeDto["difficulty"]>(initial.difficulty);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [visibility, setVisibility] =
    useState<NonNullable<CreateRecipeDto["visibility"]>>(initial.visibility);
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl);
  const [sourceAuthor, setSourceAuthor] = useState(initial.sourceAuthor);
  const [categoryIds, setCategoryIds] = useState(initial.categoryIds);
  const [ingredientGroups, setIngredientGroups] = useState(
    initial.ingredientGroups,
  );
  const [ingredients, setIngredients] = useState(initial.ingredients);
  const [steps, setSteps] = useState(initial.steps);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "ingredient"; key: string }
    | { kind: "step"; key: string }
    | { kind: "group"; id: string; name: string }
    | null
  >(null);
  const [dragIngredientKey, setDragIngredientKey] = useState<string | null>(null);
  const [dragStepKey, setDragStepKey] = useState<string | null>(null);
  const [assigningStepKey, setAssigningStepKey] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const recipeId = forceCreateMode ? undefined : initialRecipe?.id;
  const hasStepImages = steps.some((step) => step.image);

  const isDirty = useMemo(() => {
    return (
      JSON.stringify({
        name,
        description,
        servings,
        prepTimeMinutes,
        cookTimeMinutes,
        difficulty,
        tags,
        visibility,
        sourceUrl,
        sourceAuthor,
        categoryIds,
        ingredientGroups,
        ingredients,
        steps: steps.map((step) => ({
          key: step.key,
          title: step.title,
          instruction: step.instruction,
          tip: step.tip,
          showTip: step.showTip,
          durationMinutes: step.durationMinutes,
          ingredientIds: step.ingredientIds,
          stepId: step.stepId,
          image: step.image,
          hasPending: Boolean(step.pendingImageFile),
        })),
        coverFile: coverFile?.name ?? null,
      }) !==
      JSON.stringify({
        name: initial.name,
        description: initial.description,
        servings: initial.servings,
        prepTimeMinutes: initial.prepTimeMinutes,
        cookTimeMinutes: initial.cookTimeMinutes,
        difficulty: initial.difficulty,
        tags: initial.tags,
        visibility: initial.visibility,
        sourceUrl: initial.sourceUrl,
        sourceAuthor: initial.sourceAuthor,
        categoryIds: initial.categoryIds,
        ingredientGroups: initial.ingredientGroups,
        ingredients: initial.ingredients,
        steps: initial.steps.map((step) => ({
          key: step.key,
          title: step.title,
          instruction: step.instruction,
          tip: step.tip,
          showTip: step.showTip,
          durationMinutes: step.durationMinutes,
          ingredientIds: step.ingredientIds,
          stepId: step.stepId,
          image: step.image,
          hasPending: false,
        })),
        coverFile: null,
      })
    );
  }, [
    name,
    description,
    servings,
    prepTimeMinutes,
    cookTimeMinutes,
    difficulty,
    tags,
    visibility,
    sourceUrl,
    sourceAuthor,
    categoryIds,
    ingredientGroups,
    ingredients,
    steps,
    coverFile,
    initial,
  ]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function commitTagDraft() {
    const next = normalizeTag(tagDraft);
    if (!next) {
      setTagDraft("");
      return;
    }
    setTags((current) =>
      current.some(
        (tag) => tag.toLocaleLowerCase("pl") === next.toLocaleLowerCase("pl"),
      )
        ? current
        : [...current, next],
    );
    setTagDraft("");
  }

  const categoriesQuery = useQuery({
    queryKey: ["recipe-categories", kitchenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const { data, error } = await client.GET(
        "/api/kitchens/{kitchenId}/recipe-categories",
        { params: { path: { kitchenId } } },
      );
      if (error) {
        throw new Error(readApiError(error, "Nie udało się pobrać kategorii."));
      }
      return data ?? [];
    },
  });

  function updateIngredient(
    key: string,
    patch: Partial<IngredientDraft>,
  ): void {
    setIngredients((current) =>
      current.map((entry) =>
        entry.key === key ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function deleteGroup(group: IngredientGroupDraft): void {
    setDeleteTarget({ kind: "group", id: group.id, name: group.name });
  }

  function confirmDelete(): void {
    if (!deleteTarget) {
      return;
    }
    if (deleteTarget.kind === "ingredient") {
      setIngredients((current) => {
        const next = current.filter((entry) => entry.key !== deleteTarget.key);
        return next.length > 0 ? next : [createIngredientDraft()];
      });
      setSteps((current) =>
        current.map((step) => ({
          ...step,
          ingredientIds: step.ingredientIds.filter(
            (id) => id !== deleteTarget.key,
          ),
        })),
      );
    } else if (deleteTarget.kind === "step") {
      setSteps((current) => {
        const next = current.filter((entry) => entry.key !== deleteTarget.key);
        return next.length > 0 ? next : [createStepDraft()];
      });
    } else {
      setIngredientGroups((current) =>
        current.filter((entry) => entry.id !== deleteTarget.id),
      );
      setIngredients((current) =>
        current.map((entry) =>
          entry.groupId === deleteTarget.id
            ? { ...entry, groupId: null }
            : entry,
        ),
      );
    }
    setDeleteTarget(null);
  }

  function requestRemoveIngredient(ingredient: IngredientDraft): void {
    if (!ingredientHasContent(ingredient)) {
      setIngredients((current) => {
        const next = current.filter((entry) => entry.key !== ingredient.key);
        return next.length > 0 ? next : [createIngredientDraft()];
      });
      setSteps((current) =>
        current.map((step) => ({
          ...step,
          ingredientIds: step.ingredientIds.filter(
            (id) => id !== ingredient.key,
          ),
        })),
      );
      return;
    }
    setDeleteTarget({ kind: "ingredient", key: ingredient.key });
  }

  function requestRemoveStep(step: StepDraft): void {
    if (!stepHasContent(step)) {
      setSteps((current) => {
        const next = current.filter((entry) => entry.key !== step.key);
        return next.length > 0 ? next : [createStepDraft()];
      });
      return;
    }
    setDeleteTarget({ kind: "step", key: step.key });
  }

  function focusFirstError(nextErrors: Record<string, string>): void {
    const firstKey = Object.keys(nextErrors)[0];
    if (!firstKey || !formRef.current) {
      return;
    }
    window.requestAnimationFrame(() => {
      const byId = formRef.current?.querySelector<HTMLElement>(`#${firstKey}`);
      if (byId) {
        byId.focus();
        byId.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const byName = formRef.current?.querySelector<HTMLElement>(
        `[name="${firstKey}"]`,
      );
      byName?.focus();
      byName?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const nextFieldErrors: Record<string, string> = {};

    if (!name.trim()) {
      nextFieldErrors["recipe-name"] = "Podaj nazwę przepisu.";
    }

    const servingsValue = Number(servings.trim().replace(",", "."));
    if (!Number.isInteger(servingsValue) || servingsValue <= 0) {
      nextFieldErrors["recipe-servings"] =
        "Liczba porcji musi być dodatnią liczbą całkowitą.";
    }

    const parseOptionalMinutes = (value: string): number | null | undefined => {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed.replace(",", "."));
      if (!Number.isInteger(parsed) || parsed < 0) {
        return undefined;
      }
      return parsed;
    };

    const prep = parseOptionalMinutes(prepTimeMinutes);
    if (prep === undefined) {
      nextFieldErrors["recipe-prep"] =
        "Czas przygotowania musi być nieujemną liczbą całkowitą.";
    }

    const cook = parseOptionalMinutes(cookTimeMinutes);
    if (cook === undefined) {
      nextFieldErrors["recipe-cook"] =
        "Czas gotowania musi być nieujemną liczbą całkowitą.";
    }

    const sourceUrlTrimmed = sourceUrl.trim();
    if (sourceUrlTrimmed && !isHttpUrl(sourceUrlTrimmed)) {
      nextFieldErrors["recipe-source-url"] =
        "Adres źródła musi zaczynać się od http:// lub https://.";
    }

    const normalizedGroups: NonNullable<CreateRecipeDto["ingredientGroups"]> =
      [];
    for (let index = 0; index < ingredientGroups.length; index++) {
      const group = ingredientGroups[index];
      if (!group) {
        continue;
      }
      const trimmedName = group.name.trim();
      if (!trimmedName) {
        nextFieldErrors[`group-name-${group.key}`] =
          `Podaj nazwę grupy składników nr ${index + 1}.`;
        continue;
      }
      normalizedGroups.push({
        id: group.id,
        name: trimmedName,
        sortOrder: normalizedGroups.length,
      });
    }

    const groupIdSet = new Set(normalizedGroups.map((group) => group.id));

    const normalizedIngredients: CreateRecipeDto["ingredients"] = [];
    for (let index = 0; index < ingredients.length; index++) {
      const ingredient = ingredients[index];
      if (!ingredient || !ingredient.name.trim()) {
        continue;
      }
      const groupId =
        ingredient.groupId && groupIdSet.has(ingredient.groupId)
          ? ingredient.groupId
          : null;
      const quantityTrimmed = ingredient.quantity.trim();
      const ingredientId = ingredient.id ?? ingredient.key;
      if (quantityTrimmed) {
        const apiQty = toApiQuantityString(quantityTrimmed);
        if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(apiQty)) {
          nextFieldErrors[`ingredient-qty-${ingredient.key}`] =
            `Nieprawidłowa ilość dla składnika „${ingredient.name.trim()}”.`;
          continue;
        }
        normalizedIngredients.push({
          id: ingredientId,
          groupId,
          name: ingredient.name.trim(),
          quantity: apiQty,
          unit: ingredient.unit,
          note: ingredient.note.trim() ? ingredient.note.trim() : null,
          productId: ingredient.productId || undefined,
          sortOrder: normalizedIngredients.length,
        });
      } else {
        normalizedIngredients.push({
          id: ingredientId,
          groupId,
          name: ingredient.name.trim(),
          quantity: undefined,
          unit: ingredient.unit,
          note: ingredient.note.trim() ? ingredient.note.trim() : null,
          productId: ingredient.productId || undefined,
          sortOrder: normalizedIngredients.length,
        });
      }
    }

    if (normalizedIngredients.length === 0) {
      setFormError("Dodaj co najmniej jeden składnik.");
    }

    const normalizedSteps: CreateRecipeDto["steps"] = [];
    const stepFiles: Array<File | null> = [];
    const validIngredientKeys = new Set(
      normalizedIngredients
        .map((ingredient) => ingredient.id)
        .filter((id): id is string => Boolean(id)),
    );
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      if (!step || !step.instruction.trim()) {
        continue;
      }
      const durationTrimmed = step.durationMinutes.trim();
      let durationMinutes: number | null | undefined = null;
      if (durationTrimmed) {
        const parsed = Number(durationTrimmed.replace(",", "."));
        if (!Number.isInteger(parsed) || parsed < 1) {
          nextFieldErrors[`step-duration-${step.key}`] =
            `Czas kroku ${index + 1} musi być dodatnią liczbą całkowitą (minuty).`;
          continue;
        }
        durationMinutes = parsed;
      }
      const tipTrimmed = step.showTip ? step.tip.trim() : "";
      const stepId = step.stepId ?? step.key;
      normalizedSteps.push({
        id: stepId,
        title: step.title.trim() || undefined,
        instruction: step.instruction.trim(),
        tip: tipTrimmed ? tipTrimmed : null,
        durationMinutes,
        sortOrder: normalizedSteps.length,
        ingredientIds: step.ingredientIds.filter((id) =>
          validIngredientKeys.has(id),
        ),
      });
      stepFiles.push(step.pendingImageFile ?? null);
    }

    if (normalizedSteps.length === 0) {
      setFormError("Dodaj co najmniej jeden krok przygotowania.");
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      const firstMessage = Object.values(nextFieldErrors)[0] ?? "Popraw błędy formularza.";
      setFormError(firstMessage);
      focusFirstError(nextFieldErrors);
      return;
    }

    if (normalizedIngredients.length === 0 || normalizedSteps.length === 0) {
      setFieldErrors({});
      return;
    }

    setFieldErrors({});
    onSubmit(
      {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        servings: servingsValue,
        prepTimeMinutes: prep ?? null,
        cookTimeMinutes: cook ?? null,
        difficulty,
        tags,
        visibility,
        sourceUrl: sourceUrlTrimmed ? sourceUrlTrimmed : null,
        sourceAuthor: sourceAuthor.trim() ? sourceAuthor.trim() : null,
        categoryIds,
        ingredientGroups: normalizedGroups,
        ingredients: normalizedIngredients,
        steps: normalizedSteps,
      },
      { coverFile, stepFiles },
    );
  }

  return (
    <>
    <form
      ref={formRef}
      id={formId}
      onSubmit={handleSubmit}
      className="mx-auto max-w-4xl space-y-8"
      noValidate
    >
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3 border-b border-stone-100 bg-stone-50/50 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Info size={20} aria-hidden />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-stone-900">
              Podstawowe informacje
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Opisz przepis i ustaw jego najważniejsze parametry.
            </p>
          </div>
        </div>

        <div className="space-y-6 p-5 lg:p-8">
          {recipeId ? (
            <RecipeCoverField
              kitchenId={kitchenId}
              recipeId={recipeId}
              initialImage={initialRecipe?.coverImage ?? null}
            />
          ) : (
            <PendingImageField
              file={coverFile}
              onFileSelected={setCoverFile}
              label="Okładka przepisu (opcjonalnie)"
              size="cover"
              pickLabel={coverFile ? "Zmień okładkę" : "Dodaj okładkę"}
              note="Zdjęcie wyślemy po utworzeniu przepisu."
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="recipe-name">
              Nazwa przepisu <span className="text-red-500">*</span>
            </Label>
            <Input
              id="recipe-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="np. Omlet z warzywami"
              className={cn(
                FORM_INPUT_CLASS,
                fieldErrors["recipe-name"] && "border-red-400",
              )}
              aria-invalid={Boolean(fieldErrors["recipe-name"])}
              aria-describedby={
                fieldErrors["recipe-name"] ? "recipe-name-error" : undefined
              }
            />
            {fieldErrors["recipe-name"] ? (
              <p id="recipe-name-error" className="text-xs text-red-600" role="alert">
                {fieldErrors["recipe-name"]}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipe-description">Opis</Label>
            <textarea
              id="recipe-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Krótko opisz smak, okazję lub najważniejsze cechy dania…"
              rows={4}
              className={cn(FORM_INPUT_CLASS, "block resize-y")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="recipe-servings" className="flex items-center gap-1.5">
                <Users size={15} className="text-stone-400" aria-hidden />
                Porcje
              </Label>
              <Input
                id="recipe-servings"
                inputMode="numeric"
                value={servings}
                onChange={(event) => setServings(event.target.value)}
                className={cn(
                  FORM_INPUT_CLASS,
                  fieldErrors["recipe-servings"] && "border-red-400",
                )}
                aria-invalid={Boolean(fieldErrors["recipe-servings"])}
                aria-describedby={
                  fieldErrors["recipe-servings"]
                    ? "recipe-servings-error"
                    : undefined
                }
              />
              {fieldErrors["recipe-servings"] ? (
                <p
                  id="recipe-servings-error"
                  className="text-xs text-red-600"
                  role="alert"
                >
                  {fieldErrors["recipe-servings"]}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipe-prep" className="flex items-center gap-1.5">
                <Clock size={15} className="text-stone-400" aria-hidden />
                Przygotowanie
              </Label>
              <div className="relative">
                <Input
                  id="recipe-prep"
                  inputMode="numeric"
                  value={prepTimeMinutes}
                  onChange={(event) => setPrepTimeMinutes(event.target.value)}
                  placeholder="0"
                  className={cn(
                    FORM_INPUT_CLASS,
                    "pr-12",
                    fieldErrors["recipe-prep"] && "border-red-400",
                  )}
                  aria-invalid={Boolean(fieldErrors["recipe-prep"])}
                  aria-describedby={
                    fieldErrors["recipe-prep"] ? "recipe-prep-error" : undefined
                  }
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-stone-400">
                  min
                </span>
              </div>
              {fieldErrors["recipe-prep"] ? (
                <p id="recipe-prep-error" className="text-xs text-red-600" role="alert">
                  {fieldErrors["recipe-prep"]}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipe-cook" className="flex items-center gap-1.5">
                <Flame size={15} className="text-stone-400" aria-hidden />
                Gotowanie
              </Label>
              <div className="relative">
                <Input
                  id="recipe-cook"
                  inputMode="numeric"
                  value={cookTimeMinutes}
                  onChange={(event) => setCookTimeMinutes(event.target.value)}
                  placeholder="0"
                  className={cn(
                    FORM_INPUT_CLASS,
                    "pr-12",
                    fieldErrors["recipe-cook"] && "border-red-400",
                  )}
                  aria-invalid={Boolean(fieldErrors["recipe-cook"])}
                  aria-describedby={
                    fieldErrors["recipe-cook"] ? "recipe-cook-error" : undefined
                  }
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-stone-400">
                  min
                </span>
              </div>
              {fieldErrors["recipe-cook"] ? (
                <p id="recipe-cook-error" className="text-xs text-red-600" role="alert">
                  {fieldErrors["recipe-cook"]}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipe-difficulty" className="flex items-center gap-1.5">
                <Utensils size={15} className="text-stone-400" aria-hidden />
                Trudność
              </Label>
              <select
                id="recipe-difficulty"
                className={FORM_INPUT_CLASS}
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(event.target.value as CreateRecipeDto["difficulty"])
                }
              >
                {Object.entries(RECIPE_DIFFICULTY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-6 border-t border-stone-100 pt-6 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="recipe-tag-input">Tagi</Label>
              <div className="flex min-h-[46px] flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] transition-all focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-100 px-3 py-1 text-sm font-medium text-stone-700"
                  >
                    {tag}
                    <button
                      type="button"
                      className="rounded text-stone-400 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
                      aria-label={`Usuń tag ${tag}`}
                      onClick={() =>
                        setTags((current) =>
                          current.filter((entry) => entry !== tag),
                        )
                      }
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </span>
                ))}
                <input
                  id="recipe-tag-input"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      commitTagDraft();
                    }
                  }}
                  onBlur={commitTagDraft}
                  className="min-w-[140px] flex-1 bg-transparent py-1 text-sm text-stone-800 outline-none placeholder:text-stone-400"
                  placeholder="Wpisz tag i naciśnij Enter…"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipe-visibility">Widoczność</Label>
              <select
                id="recipe-visibility"
                className={FORM_INPUT_CLASS}
                value={visibility}
                onChange={(event) =>
                  setVisibility(
                    event.target.value as NonNullable<
                      CreateRecipeDto["visibility"]
                    >,
                  )
                }
              >
                {Object.entries(RECIPE_VISIBILITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipe-source-author">Autor lub nazwa źródła</Label>
              <Input
                id="recipe-source-author"
                value={sourceAuthor}
                onChange={(event) => setSourceAuthor(event.target.value)}
                placeholder="np. Anna Kowalska"
                className={FORM_INPUT_CLASS}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipe-source-url">Adres źródłowy</Label>
              <Input
                id="recipe-source-url"
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://…"
                className={cn(
                  FORM_INPUT_CLASS,
                  fieldErrors["recipe-source-url"] && "border-red-400",
                )}
                aria-invalid={Boolean(fieldErrors["recipe-source-url"])}
                aria-describedby={
                  fieldErrors["recipe-source-url"]
                    ? "recipe-source-url-error"
                    : undefined
                }
              />
              {fieldErrors["recipe-source-url"] ? (
                <p
                  id="recipe-source-url-error"
                  className="text-xs text-red-600"
                  role="alert"
                >
                  {fieldErrors["recipe-source-url"]}
                </p>
              ) : null}
            </div>
          </div>

          <RecipeCategoryPicker
            categories={categoriesQuery.data ?? []}
            selectedIds={categoryIds}
            onChange={setCategoryIds}
            disabled={categoriesQuery.isPending}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <ShoppingBasket size={20} aria-hidden />
            </div>
            <div>
              <h2 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-stone-900">
                Składniki
              </h2>
              <p className="mt-0.5 text-xs text-stone-500">
                Ustal kolejność i opcjonalnie podziel składniki na grupy.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setIngredientGroups((current) => [
                ...current,
                createGroupDraft({ name: "" }),
              ])
            }
          >
            <Plus size={14} className="mr-1.5" aria-hidden />
            Dodaj grupę
          </Button>
        </div>

        {ingredientGroups.length > 0 ? (
          <div className="space-y-3 border-b border-stone-100 bg-stone-50/60 px-5 py-4 lg:px-8">
            <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
              Grupy składników
            </p>
            {ingredientGroups.map((group, index) => {
              const errorKey = `group-name-${group.key}`;
              return (
                <div
                  key={group.key}
                  className="flex flex-wrap items-start gap-2 rounded-xl border border-stone-200 bg-white p-3"
                >
                  <div className="min-w-[12rem] flex-1">
                    <Label htmlFor={errorKey} className="sr-only">
                      Nazwa grupy {index + 1}
                    </Label>
                    <Input
                      id={errorKey}
                      value={group.name}
                      onChange={(event) =>
                        setIngredientGroups((current) =>
                          current.map((entry) =>
                            entry.key === group.key
                              ? { ...entry, name: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      placeholder={`Nazwa grupy ${index + 1}`}
                      className={cn(
                        FORM_INPUT_CLASS,
                        fieldErrors[errorKey] && "border-red-400",
                      )}
                      aria-invalid={Boolean(fieldErrors[errorKey])}
                    />
                    {fieldErrors[errorKey] ? (
                      <p className="mt-1 text-xs text-red-600" role="alert">
                        {fieldErrors[errorKey]}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={index === 0}
                    onClick={() =>
                      setIngredientGroups((current) =>
                        moveItem(current, index, -1),
                      )
                    }
                    aria-label="Przenieś grupę wyżej"
                  >
                    <ArrowUp size={15} aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={index === ingredientGroups.length - 1}
                    onClick={() =>
                      setIngredientGroups((current) =>
                        moveItem(current, index, 1),
                      )
                    }
                    aria-label="Przenieś grupę niżej"
                  >
                    <ArrowDown size={15} aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="text-red-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    onClick={() => deleteGroup(group)}
                    aria-label={`Usuń grupę ${group.name || index + 1}`}
                  >
                    <Trash2 size={15} aria-hidden />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="divide-y divide-stone-100">
          {ingredients.map((ingredient, index) => {
            const quantityErrorKey = `ingredient-qty-${ingredient.key}`;
            return (
              <article
                key={ingredient.key}
                draggable
                onDragStart={() => setDragIngredientKey(ingredient.key)}
                onDragEnd={() => setDragIngredientKey(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!dragIngredientKey || dragIngredientKey === ingredient.key) {
                    return;
                  }
                  setIngredients((current) => {
                    const from = current.findIndex(
                      (entry) => entry.key === dragIngredientKey,
                    );
                    const to = current.findIndex(
                      (entry) => entry.key === ingredient.key,
                    );
                    return reorderByIndex(current, from, to);
                  });
                  setDragIngredientKey(null);
                }}
                className={cn(
                  "p-5 transition-colors lg:p-8",
                  dragIngredientKey === ingredient.key && "bg-emerald-50/50 opacity-70",
                )}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <GripVertical
                      size={18}
                      className="cursor-grab text-stone-300 active:cursor-grabbing"
                      aria-hidden
                    />
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                      {index + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-stone-800">
                      Składnik {index + 1}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() =>
                        setIngredients((current) => moveItem(current, index, -1))
                      }
                      aria-label="Przenieś składnik wyżej"
                    >
                      <ArrowUp size={15} aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={index === ingredients.length - 1}
                      onClick={() =>
                        setIngredients((current) => moveItem(current, index, 1))
                      }
                      aria-label="Przenieś składnik niżej"
                    >
                      <ArrowDown size={15} aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-stone-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => requestRemoveIngredient(ingredient)}
                      aria-label={`Usuń składnik ${index + 1}`}
                    >
                      <Trash2 size={16} aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label htmlFor={`ingredient-name-${ingredient.key}`}>
                      Nazwa składnika
                    </Label>
                    <Input
                      id={`ingredient-name-${ingredient.key}`}
                      value={ingredient.name}
                      onChange={(event) =>
                        updateIngredient(ingredient.key, {
                          name: event.target.value,
                        })
                      }
                      placeholder="np. Jajka"
                      className={FORM_INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Produkt z katalogu (opcjonalnie)</Label>
                    <RecipeIngredientProductLink
                      products={products}
                      productId={ingredient.productId}
                      onChange={(productId, product) =>
                        updateIngredient(ingredient.key, {
                          productId,
                          ...(product
                            ? {
                                unit: product.defaultUnit as IngredientUnit,
                                name: ingredient.name.trim()
                                  ? ingredient.name
                                  : product.name,
                              }
                            : {}),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {ingredientGroups.length > 0 ? (
                    <div className="space-y-2">
                      <Label htmlFor={`ingredient-group-${ingredient.key}`}>
                        Grupa
                      </Label>
                      <select
                        id={`ingredient-group-${ingredient.key}`}
                        className={FORM_INPUT_CLASS}
                        value={ingredient.groupId ?? ""}
                        onChange={(event) =>
                          updateIngredient(ingredient.key, {
                            groupId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">Bez grupy</option>
                        {ingredientGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name.trim() || "Bez nazwy"}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor={quantityErrorKey}>
                      Ilość
                      {QUANTITY_OPTIONAL_UNITS.has(ingredient.unit) ? (
                        <span className="ml-1 font-normal text-stone-400">
                          (opcjonalnie)
                        </span>
                      ) : null}
                    </Label>
                    <Input
                      id={quantityErrorKey}
                      inputMode="decimal"
                      value={ingredient.quantity}
                      onChange={(event) =>
                        updateIngredient(ingredient.key, {
                          quantity: event.target.value,
                        })
                      }
                      placeholder="np. 2 lub 0,5"
                      className={cn(
                        FORM_INPUT_CLASS,
                        fieldErrors[quantityErrorKey] && "border-red-400",
                      )}
                      aria-invalid={Boolean(fieldErrors[quantityErrorKey])}
                    />
                    {fieldErrors[quantityErrorKey] ? (
                      <p className="text-xs text-red-600" role="alert">
                        {fieldErrors[quantityErrorKey]}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`ingredient-unit-${ingredient.key}`}>
                      Jednostka
                    </Label>
                    <select
                      id={`ingredient-unit-${ingredient.key}`}
                      className={FORM_INPUT_CLASS}
                      value={ingredient.unit}
                      onChange={(event) =>
                        updateIngredient(ingredient.key, {
                          unit: event.target.value as IngredientUnit,
                        })
                      }
                    >
                      {Object.entries(RECIPE_INGREDIENT_UNIT_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`ingredient-note-${ingredient.key}`}>
                      Notatka
                    </Label>
                    <Input
                      id={`ingredient-note-${ingredient.key}`}
                      value={ingredient.note}
                      onChange={(event) =>
                        updateIngredient(ingredient.key, {
                          note: event.target.value,
                        })
                      }
                      placeholder="np. drobno posiekana"
                      className={FORM_INPUT_CLASS}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="border-t border-stone-100 bg-stone-50/40 p-5 lg:px-8">
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            onClick={() =>
              setIngredients((current) => [...current, createIngredientDraft()])
            }
          >
            <Plus size={16} className="mr-2" aria-hidden />
            Dodaj kolejny składnik
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3 border-b border-stone-100 bg-stone-50/50 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <ListOrdered size={20} aria-hidden />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-serif)] text-xl font-semibold text-stone-900">
              Kroki przygotowania
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Opisz przygotowanie potrawy krok po kroku.
            </p>
          </div>
        </div>

        {recipeId && hasStepImages ? (
          <p className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-3 text-xs text-emerald-900 lg:px-8">
            Zdjęcia istniejących kroków zapisują się od razu. Usunięcie kroku
            usunie również przypisane do niego zdjęcie.
          </p>
        ) : null}

        <div className="divide-y divide-stone-100">
          {steps.map((step, index) => {
            const durationErrorKey = `step-duration-${step.key}`;
            return (
              <article
                key={step.key}
                draggable
                onDragStart={() => setDragStepKey(step.key)}
                onDragEnd={() => setDragStepKey(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!dragStepKey || dragStepKey === step.key) {
                    return;
                  }
                  setSteps((current) => {
                    const from = current.findIndex(
                      (entry) => entry.key === dragStepKey,
                    );
                    const to = current.findIndex(
                      (entry) => entry.key === step.key,
                    );
                    return reorderByIndex(current, from, to);
                  });
                  setDragStepKey(null);
                }}
                className={cn(
                  "p-5 transition-colors lg:p-8",
                  dragStepKey === step.key && "bg-emerald-50/50 opacity-70",
                )}
              >
                <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)]">
                  <div className="flex items-start gap-2 lg:flex-col lg:items-center">
                    <GripVertical
                      size={18}
                      className="mt-2 cursor-grab text-stone-300 active:cursor-grabbing"
                      aria-hidden
                    />
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-[family-name:var(--font-serif)] text-lg font-bold text-white shadow-sm">
                      {index + 1}
                    </span>
                  </div>

                  <div className="min-w-0 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                        <div className="space-y-2">
                          <Label htmlFor={`step-title-${step.key}`}>
                            Tytuł kroku
                            <span className="ml-1 font-normal text-stone-400">
                              (opcjonalnie)
                            </span>
                          </Label>
                          <Input
                            id={`step-title-${step.key}`}
                            value={step.title}
                            onChange={(event) =>
                              setSteps((current) =>
                                current.map((entry) =>
                                  entry.key === step.key
                                    ? { ...entry, title: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                            placeholder="np. Przygotowanie ciasta"
                            className={FORM_INPUT_CLASS}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label
                            htmlFor={durationErrorKey}
                            className="flex items-center gap-1.5"
                          >
                            <Clock size={14} className="text-stone-400" aria-hidden />
                            Czas
                          </Label>
                          <div className="relative">
                            <Input
                              id={durationErrorKey}
                              inputMode="numeric"
                              value={step.durationMinutes}
                              onChange={(event) =>
                                setSteps((current) =>
                                  current.map((entry) =>
                                    entry.key === step.key
                                      ? {
                                          ...entry,
                                          durationMinutes: event.target.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                              placeholder="0"
                              className={cn(
                                FORM_INPUT_CLASS,
                                "pr-12",
                                fieldErrors[durationErrorKey] && "border-red-400",
                              )}
                              aria-invalid={Boolean(fieldErrors[durationErrorKey])}
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-stone-400">
                              min
                            </span>
                          </div>
                          {fieldErrors[durationErrorKey] ? (
                            <p className="text-xs text-red-600" role="alert">
                              {fieldErrors[durationErrorKey]}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 pt-7">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === 0}
                          onClick={() =>
                            setSteps((current) => moveItem(current, index, -1))
                          }
                          aria-label="Przenieś krok wyżej"
                        >
                          <ArrowUp size={15} aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === steps.length - 1}
                          onClick={() =>
                            setSteps((current) => moveItem(current, index, 1))
                          }
                          aria-label="Przenieś krok niżej"
                        >
                          <ArrowDown size={15} aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-stone-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => requestRemoveStep(step)}
                          aria-label={`Usuń krok ${index + 1}`}
                        >
                          <Trash2 size={16} aria-hidden />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`step-instruction-${step.key}`}>
                        Instrukcja
                      </Label>
                      <textarea
                        id={`step-instruction-${step.key}`}
                        value={step.instruction}
                        onChange={(event) =>
                          setSteps((current) =>
                            current.map((entry) =>
                              entry.key === step.key
                                ? { ...entry, instruction: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        rows={4}
                        placeholder="Opisz dokładnie, co należy zrobić…"
                        className={cn(
                          FORM_INPUT_CLASS,
                          "block resize-y whitespace-pre-wrap",
                        )}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setAssigningStepKey(step.key)}
                      >
                        Przypisz składniki
                      </Button>
                      <span className="text-xs text-stone-500">
                        {step.ingredientIds.length > 0
                          ? `${step.ingredientIds.length} przypisane składniki`
                          : "Brak przypisań"}
                      </span>
                    </div>

                    {step.showTip ? (
                      <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label
                            htmlFor={`step-tip-${step.key}`}
                            className="flex items-center gap-2 text-amber-900"
                          >
                            <Lightbulb size={16} className="text-amber-500" aria-hidden />
                            Wskazówka
                          </Label>
                          <button
                            type="button"
                            className="text-xs font-medium text-amber-700 hover:text-red-600"
                            onClick={() =>
                              setSteps((current) =>
                                current.map((entry) =>
                                  entry.key === step.key
                                    ? { ...entry, tip: "", showTip: false }
                                    : entry,
                                ),
                              )
                            }
                          >
                            Usuń wskazówkę
                          </button>
                        </div>
                        <textarea
                          id={`step-tip-${step.key}`}
                          value={step.tip}
                          onChange={(event) =>
                            setSteps((current) =>
                              current.map((entry) =>
                                entry.key === step.key
                                  ? { ...entry, tip: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                          rows={2}
                          placeholder="Dodaj pomocną radę dotyczącą tego kroku…"
                          className={cn(
                            FORM_INPUT_CLASS,
                            "block resize-y border-amber-200 bg-white/90 whitespace-pre-wrap focus:border-amber-400 focus:ring-amber-400/10",
                          )}
                        />
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                        onClick={() =>
                          setSteps((current) =>
                            current.map((entry) =>
                              entry.key === step.key
                                ? { ...entry, showTip: true }
                                : entry,
                            ),
                          )
                        }
                      >
                        <Lightbulb size={14} className="mr-1.5" aria-hidden />
                        Dodaj wskazówkę
                      </Button>
                    )}

                    <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-700">
                        <ImagePlus size={16} className="text-stone-400" aria-hidden />
                        Zdjęcie kroku
                      </div>
                      {recipeId && step.stepId ? (
                        <RecipeStepImageField
                          kitchenId={kitchenId}
                          recipeId={recipeId}
                          stepId={step.stepId}
                          initialImage={step.image ?? null}
                          label={`Zdjęcie kroku ${index + 1}`}
                        />
                      ) : (
                        <PendingImageField
                          file={step.pendingImageFile ?? null}
                          onFileSelected={(file) =>
                            setSteps((current) =>
                              current.map((entry) =>
                                entry.key === step.key
                                  ? { ...entry, pendingImageFile: file }
                                  : entry,
                              ),
                            )
                          }
                          label={`Zdjęcie kroku ${index + 1} (opcjonalnie)`}
                          size="wide"
                          note="Zdjęcie wyślemy po zapisaniu przepisu."
                        />
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="border-t border-stone-100 bg-stone-50/40 p-5 lg:px-8">
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            onClick={() =>
              setSteps((current) => [...current, createStepDraft()])
            }
          >
            <Plus size={16} className="mr-2" aria-hidden />
            Dodaj kolejny krok
          </Button>
        </div>
      </section>

      {formError ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {formError}
        </p>
      ) : null}

      {!hideSubmit ? (
        <Button
          type="submit"
          disabled={pendingSubmit}
          className="rounded-xl bg-emerald-600 px-6 hover:bg-emerald-700"
        >
          {pendingSubmit ? "Zapisywanie…" : submitLabel}
        </Button>
      ) : null}
    </form>

    {deleteTarget ? (
      <ConfirmDialog
        title={
          deleteTarget.kind === "ingredient"
            ? "Usunąć składnik?"
            : deleteTarget.kind === "step"
              ? "Usunąć krok?"
              : "Usunąć grupę składników?"
        }
        description={
          deleteTarget.kind === "ingredient"
            ? "Składnik zostanie usunięty z przepisu."
            : deleteTarget.kind === "step"
              ? "Krok zostanie usunięty wraz z przypisanym zdjęciem."
              : `Grupa „${deleteTarget.name.trim() || "Bez nazwy"}” zostanie usunięta. Jej składniki pozostaną w przepisie bez przypisanej grupy.`
        }
        confirmLabel="Usuń"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    ) : null}

    {assigningStepKey ? (
      <RecipeStepIngredientPicker
        stepTitle={
          steps.find((step) => step.key === assigningStepKey)?.title.trim() ||
          "Krok bez tytułu"
        }
        ingredients={ingredients
          .filter((ingredient) => ingredient.name.trim())
          .map((ingredient) => ({
            key: ingredient.key,
            name: ingredient.name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            note: ingredient.note,
          }))}
        selectedKeys={
          steps.find((step) => step.key === assigningStepKey)?.ingredientIds ??
          []
        }
        onClose={() => setAssigningStepKey(null)}
        onApply={(keys) => {
          setSteps((current) =>
            current.map((step) =>
              step.key === assigningStepKey
                ? { ...step, ingredientIds: keys }
                : step,
            ),
          );
          setAssigningStepKey(null);
        }}
      />
    ) : null}
    </>
  );
}
