"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PendingImageField } from "@/components/media-image-field";
import { ProductThumb } from "@/components/product-thumb";
import { RecipeCategoryPicker } from "@/components/recipe-category-picker";
import {
  RecipeCoverField,
  RecipeStepImageField,
} from "@/components/recipe-media-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebApiClient } from "@/lib/api";
import { UNIT_LABELS, readApiError } from "@/lib/errors";
import { formatQuantityNumber, toApiQuantityString } from "@/lib/format-quantity";
import type { MediaImage } from "@/lib/media-upload";
import { productImageUrls } from "@/lib/product-image";
import {
  RECIPE_DIFFICULTY_LABELS,
  RECIPE_INGREDIENT_UNIT_LABELS,
  RECIPE_VISIBILITY_LABELS,
} from "@/lib/recipe-labels";

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
  submitLabel: string;
  pending?: boolean;
  onSubmit: (body: RecipeFormValues, media: RecipeFormMedia) => void;
};

function createIngredientDraft(
  partial?: Partial<IngredientDraft> & { key?: string },
): IngredientDraft {
  return {
    key: partial?.key ?? crypto.randomUUID(),
    ...(partial?.id ? { id: partial.id } : {}),
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
  tags: string;
  visibility: CreateRecipeDto["visibility"];
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
    tags: recipe.tags.join(", "),
    visibility: recipe.visibility,
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
                title: step.title ?? "",
                instruction: step.instruction,
                tip: step.tip ?? "",
                durationMinutes:
                  step.durationMinutes !== null
                    ? String(step.durationMinutes)
                    : "",
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

export function RecipeForm({
  kitchenId,
  products,
  initialRecipe,
  submitLabel,
  pending,
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
            tags: "",
            visibility: "private" as const,
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
  const [tags, setTags] = useState(initial.tags);
  const [visibility, setVisibility] =
    useState<NonNullable<CreateRecipeDto["visibility"]>>(initial.visibility);
  const [categoryIds, setCategoryIds] = useState(initial.categoryIds);
  const [ingredientGroups, setIngredientGroups] = useState(
    initial.ingredientGroups,
  );
  const [ingredients, setIngredients] = useState(initial.ingredients);
  const [steps, setSteps] = useState(initial.steps);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const recipeId = initialRecipe?.id;
  const hasStepImages = steps.some((step) => step.image);

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
    const confirmed = window.confirm(
      `Usunąć grupę „${group.name.trim() || "bez nazwy"}”? Składniki nie zostaną usunięte — trafią do listy bez grupy.`,
    );
    if (!confirmed) {
      return;
    }
    setIngredientGroups((current) =>
      current.filter((entry) => entry.id !== group.id),
    );
    setIngredients((current) =>
      current.map((entry) =>
        entry.groupId === group.id ? { ...entry, groupId: null } : entry,
      ),
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Podaj nazwę przepisu.");
      return;
    }

    const servingsValue = Number(servings.trim());
    if (!Number.isInteger(servingsValue) || servingsValue <= 0) {
      setFormError("Liczba porcji musi być dodatnią liczbą całkowitą.");
      return;
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
        setFormError(`Podaj nazwę grupy składników nr ${index + 1}.`);
        return;
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
      normalizedIngredients.push({
        ...(ingredient.id ? { id: ingredient.id } : {}),
        groupId,
        name: ingredient.name.trim(),
        quantity: ingredient.quantity.trim()
          ? toApiQuantityString(ingredient.quantity)
          : undefined,
        unit: ingredient.unit,
        note: ingredient.note.trim() ? ingredient.note.trim() : null,
        productId: ingredient.productId || undefined,
        sortOrder: normalizedIngredients.length,
      });
    }

    if (normalizedIngredients.length === 0) {
      setFormError("Dodaj co najmniej jeden składnik.");
      return;
    }

    for (const ingredient of normalizedIngredients) {
      if (
        ingredient.quantity &&
        !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(ingredient.quantity)
      ) {
        setFormError(
          `Nieprawidłowa ilość dla składnika „${ingredient.name}”.`,
        );
        return;
      }
    }

    const normalizedSteps: CreateRecipeDto["steps"] = [];
    const stepFiles: Array<File | null> = [];
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      if (!step || !step.instruction.trim()) {
        continue;
      }
      const durationTrimmed = step.durationMinutes.trim();
      let durationMinutes: number | null | undefined = null;
      if (durationTrimmed) {
        const parsed = Number(durationTrimmed);
        if (!Number.isInteger(parsed) || parsed < 1) {
          setFormError(
            `Czas kroku ${index + 1} musi być dodatnią liczbą całkowitą (minuty).`,
          );
          return;
        }
        durationMinutes = parsed;
      }
      const tipTrimmed = step.showTip ? step.tip.trim() : "";
      normalizedSteps.push({
        ...(step.stepId ? { id: step.stepId } : {}),
        title: step.title.trim() || undefined,
        instruction: step.instruction.trim(),
        tip: tipTrimmed ? tipTrimmed : null,
        durationMinutes,
        sortOrder: normalizedSteps.length,
      });
      stepFiles.push(step.pendingImageFile ?? null);
    }

    if (normalizedSteps.length === 0) {
      setFormError("Dodaj co najmniej jeden krok przygotowania.");
      return;
    }

    const tagList = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const parseOptionalMinutes = (value: string): number | null | undefined => {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return undefined;
      }
      return parsed;
    };

    const prep = parseOptionalMinutes(prepTimeMinutes);
    if (prep === undefined) {
      setFormError("Czas przygotowania musi być nieujemną liczbą całkowitą.");
      return;
    }

    const cook = parseOptionalMinutes(cookTimeMinutes);
    if (cook === undefined) {
      setFormError("Czas gotowania musi być nieujemną liczbą całkowitą.");
      return;
    }

    onSubmit(
      {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        servings: servingsValue,
        prepTimeMinutes: prep,
        cookTimeMinutes: cook,
        difficulty,
        tags: tagList,
        visibility,
        categoryIds,
        ingredientGroups: normalizedGroups,
        ingredients: normalizedIngredients,
        steps: normalizedSteps,
      },
      { coverFile, stepFiles },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">Podstawowe informacje</h2>
        </div>
        <div className="space-y-4 p-5">
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
              size="wide"
              note="Zdjęcie wyślemy po utworzeniu przepisu."
            />
          )}
          <div className="space-y-2">
            <Label htmlFor="recipe-name">Nazwa</Label>
            <Input
              id="recipe-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="np. Omlet z warzywami"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipe-description">Opis</Label>
            <textarea
              id="recipe-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Krótki opis przepisu (opcjonalnie)"
              rows={3}
              className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="recipe-servings">Porcje</Label>
              <Input
                id="recipe-servings"
                inputMode="numeric"
                value={servings}
                onChange={(event) => setServings(event.target.value)}
              />
              <p className="text-xs text-gray-500">
                Na ile osób jest ten przepis — później przeliczysz na liście.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipe-prep">Przygotowanie (min)</Label>
              <Input
                id="recipe-prep"
                inputMode="numeric"
                value={prepTimeMinutes}
                onChange={(event) => setPrepTimeMinutes(event.target.value)}
                placeholder="opcjonalnie"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipe-cook">Gotowanie (min)</Label>
              <Input
                id="recipe-cook"
                inputMode="numeric"
                value={cookTimeMinutes}
                onChange={(event) => setCookTimeMinutes(event.target.value)}
                placeholder="opcjonalnie"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipe-difficulty">Trudność</Label>
              <select
                id="recipe-difficulty"
                className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm"
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="recipe-tags">Tagi</Label>
              <Input
                id="recipe-tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="np. śniadanie, szybkie (oddziel przecinkami)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipe-visibility">Widoczność</Label>
              <select
                id="recipe-visibility"
                className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm"
                value={visibility}
                onChange={(event) =>
                  setVisibility(
                    event.target.value as NonNullable<CreateRecipeDto["visibility"]>,
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
          </div>
          <RecipeCategoryPicker
            categories={categoriesQuery.data ?? []}
            selectedIds={categoryIds}
            onChange={setCategoryIds}
            disabled={categoriesQuery.isPending}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Składniki</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Grupy są opcjonalne — prosty przepis może zostać bez nich.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
              <Plus size={14} className="mr-1" />
              Dodaj grupę
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setIngredients((current) => [...current, createIngredientDraft()])
              }
            >
              <Plus size={14} className="mr-1" />
              Dodaj składnik
            </Button>
          </div>
        </div>

        {ingredientGroups.length > 0 ? (
          <div className="space-y-3 border-b border-gray-100 bg-gray-50/60 px-5 py-4">
            <p className="text-sm font-semibold text-gray-700">Grupy składników</p>
            <div className="space-y-2">
              {ingredientGroups.map((group, index) => (
                <div
                  key={group.key}
                  className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3"
                >
                  <Input
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
                    className="min-w-[12rem] flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === 0}
                    onClick={() =>
                      setIngredientGroups((current) =>
                        moveItem(current, index, -1),
                      )
                    }
                    aria-label="Przesuń grupę wyżej"
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === ingredientGroups.length - 1}
                    onClick={() =>
                      setIngredientGroups((current) =>
                        moveItem(current, index, 1),
                      )
                    }
                    aria-label="Przesuń grupę niżej"
                  >
                    <ArrowDown size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteGroup(group)}
                  >
                    <Trash2 size={14} className="mr-1" />
                    Usuń
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="divide-y divide-gray-100">
          {ingredients.map((ingredient, index) => (
            <div key={ingredient.key} className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-700">
                  Składnik {index + 1}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === 0}
                    onClick={() =>
                      setIngredients((current) => moveItem(current, index, -1))
                    }
                    aria-label="Przesuń składnik wyżej"
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === ingredients.length - 1}
                    onClick={() =>
                      setIngredients((current) => moveItem(current, index, 1))
                    }
                    aria-label="Przesuń składnik niżej"
                  >
                    <ArrowDown size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={ingredients.length === 1}
                    onClick={() =>
                      setIngredients((current) =>
                        current.filter((entry) => entry.key !== ingredient.key),
                      )
                    }
                  >
                    <Trash2 size={14} className="mr-1" />
                    Usuń
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nazwa</Label>
                  <Input
                    value={ingredient.name}
                    onChange={(event) =>
                      updateIngredient(ingredient.key, {
                        name: event.target.value,
                      })
                    }
                    placeholder="np. Jajka"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Produkt z katalogu (opcjonalnie)</Label>
                  <div className="flex items-center gap-3">
                    <ProductThumb
                      src={
                        productImageUrls(
                          products.find(
                            (product) => product.id === ingredient.productId,
                          ),
                        ).thumbnail
                      }
                      alt={
                        products.find(
                          (product) => product.id === ingredient.productId,
                        )?.name ?? "Produkt"
                      }
                    />
                    <select
                      className="block min-w-0 flex-1 rounded-lg border border-gray-200 bg-white p-3 text-sm"
                      value={ingredient.productId}
                      onChange={(event) => {
                        const nextProductId = event.target.value;
                        const product = products.find(
                          (entry) => entry.id === nextProductId,
                        );
                        setIngredients((current) =>
                          current.map((entry) => {
                            if (entry.key !== ingredient.key) {
                              return entry;
                            }
                            if (!product) {
                              return { ...entry, productId: "" };
                            }
                            return {
                              ...entry,
                              productId: product.id,
                              unit: product.defaultUnit as IngredientUnit,
                              name: entry.name.trim()
                                ? entry.name
                                : product.name,
                            };
                          }),
                        );
                      }}
                    >
                      <option value="">Bez powiązania</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({UNIT_LABELS[product.defaultUnit]})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {ingredientGroups.length > 0 ? (
                <div className="space-y-2">
                  <Label>Grupa</Label>
                  <select
                    className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm sm:max-w-xs"
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
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Ilość</Label>
                  <Input
                    value={ingredient.quantity}
                    onChange={(event) =>
                      updateIngredient(ingredient.key, {
                        quantity: event.target.value,
                      })
                    }
                    placeholder="opcjonalnie"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Jednostka</Label>
                  <select
                    className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm"
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
                  <Label>Notatka</Label>
                  <Input
                    value={ingredient.note}
                    onChange={(event) =>
                      updateIngredient(ingredient.key, {
                        note: event.target.value,
                      })
                    }
                    placeholder="np. drobno posiekana"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">Kroki</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSteps((current) => [...current, createStepDraft()])}
          >
            <Plus size={14} className="mr-1" />
            Dodaj krok
          </Button>
        </div>
        {recipeId && hasStepImages ? (
          <p className="border-b border-gray-100 bg-emerald-50/60 px-5 py-3 text-xs text-emerald-900">
            Zdjęcia kroków zapisują się od razu. Przy zapisie przepisu zachowujemy
            zdjęcie istniejącego kroku, gdy w payloadzie jest jego identyfikator.
            Usunięcie kroku usuwa też jego zdjęcie.
          </p>
        ) : null}
        <div className="divide-y divide-gray-100">
          {steps.map((step, index) => (
            <div key={step.key} className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-700">
                  Krok {index + 1}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === 0}
                    onClick={() => setSteps((current) => moveItem(current, index, -1))}
                    aria-label="Przesuń krok wyżej"
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === steps.length - 1}
                    onClick={() => setSteps((current) => moveItem(current, index, 1))}
                    aria-label="Przesuń krok niżej"
                  >
                    <ArrowDown size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={steps.length === 1}
                    onClick={() =>
                      setSteps((current) =>
                        current.filter((entry) => entry.key !== step.key),
                      )
                    }
                  >
                    <Trash2 size={14} className="mr-1" />
                    Usuń
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tytuł kroku (opcjonalnie)</Label>
                  <Input
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
                    placeholder="np. Przygotowanie makaronu"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Czas (min, opcjonalnie)</Label>
                  <Input
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
                    placeholder="np. 10"
                  />
                </div>
              </div>
              <textarea
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
                rows={3}
                placeholder="Opisz krok przygotowania…"
                className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm whitespace-pre-wrap"
              />
              {step.showTip ? (
                <div className="space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor={`step-tip-${step.key}`}>Wskazówka</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
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
                    </Button>
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
                    placeholder="np. Nie mieszaj zbyt długo…"
                    className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm whitespace-pre-wrap"
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
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
                  <Plus size={14} className="mr-1" />
                  Dodaj wskazówkę
                </Button>
              )}
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
                  size="sm"
                  note="Wyślemy po utworzeniu przepisu."
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {formError ? (
        <p className="text-sm text-red-600" role="alert">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Zapisywanie…" : submitLabel}
      </Button>
    </form>
  );
}
