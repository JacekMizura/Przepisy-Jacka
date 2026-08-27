"use client";

import type { components } from "@moja-kuchnia/api-client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { PendingImageField } from "@/components/media-image-field";
import {
  RecipeCoverField,
  RecipeStepImageField,
} from "@/components/recipe-media-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UNIT_LABELS } from "@/lib/errors";
import { formatQuantityNumber, toApiQuantityString } from "@/lib/format-quantity";
import type { MediaImage } from "@/lib/media-upload";
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

type IngredientDraft = {
  key: string;
  name: string;
  quantity: string;
  unit: IngredientUnit;
  note: string;
  productId: string;
};

type StepDraft = {
  key: string;
  title: string;
  instruction: string;
  durationMinutes: string;
  /** Ustawione tylko dla kroków już zapisanych w API — warunek wysyłki zdjęcia. */
  stepId?: string;
  image?: MediaImage | null;
};

type RecipeFormProps = {
  kitchenId: string;
  products: Product[];
  initialRecipe?: RecipeDetail;
  submitLabel: string;
  pending?: boolean;
  /** `coverFile` jest ustawiane tylko w trybie tworzenia — wysyłka po zapisie. */
  onSubmit: (body: CreateRecipeDto, coverFile: File | null) => void;
};

function createIngredientDraft(
  partial?: Partial<IngredientDraft> & { key?: string },
): IngredientDraft {
  return {
    key: partial?.key ?? crypto.randomUUID(),
    name: partial?.name ?? "",
    quantity: partial?.quantity ?? "",
    unit: partial?.unit ?? "piece",
    note: partial?.note ?? "",
    productId: partial?.productId ?? "",
  };
}

function createStepDraft(partial?: Partial<StepDraft> & { key?: string }): StepDraft {
  return {
    key: partial?.key ?? crypto.randomUUID(),
    title: partial?.title ?? "",
    instruction: partial?.instruction ?? "",
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
  ingredients: IngredientDraft[];
  steps: StepDraft[];
} {
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
    ingredients:
      recipe.ingredients.length > 0
        ? recipe.ingredients
            .slice()
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((ingredient) =>
              createIngredientDraft({
                name: ingredient.name,
                quantity: formatQuantityNumber(ingredient.quantity ?? ""),
                unit: ingredient.unit,
                note: ingredient.note ?? "",
                productId: ingredient.productId ?? "",
              }),
            )
        : [createIngredientDraft()],
    steps:
      recipe.steps.length > 0
        ? recipe.steps
            .slice()
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((step) =>
              createStepDraft({
                title: step.title ?? "",
                instruction: step.instruction,
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
            servings: "2",
            prepTimeMinutes: "",
            cookTimeMinutes: "",
            difficulty: "easy" as const,
            tags: "",
            visibility: "private" as const,
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
  const [ingredients, setIngredients] = useState(initial.ingredients);
  const [steps, setSteps] = useState(initial.steps);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const recipeId = initialRecipe?.id;
  const hasStepImages = steps.some((step) => step.image);

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

    const normalizedIngredients = ingredients
      .map((ingredient, index) => ({
        name: ingredient.name.trim(),
        quantity: ingredient.quantity.trim()
          ? toApiQuantityString(ingredient.quantity)
          : undefined,
        unit: ingredient.unit,
        note: ingredient.note.trim() ? ingredient.note.trim() : null,
        productId: ingredient.productId || undefined,
        sortOrder: index,
      }))
      .filter((ingredient) => ingredient.name.length > 0);

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
      normalizedSteps.push({
        title: step.title.trim() || undefined,
        instruction: step.instruction.trim(),
        durationMinutes,
        sortOrder: normalizedSteps.length,
      } as components["schemas"]["RecipeStepInputDto"]);
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
        ingredients: normalizedIngredients,
        steps: normalizedSteps,
      },
      coverFile,
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
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">Składniki</h2>
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
                      setIngredients((current) =>
                        current.map((entry) =>
                          entry.key === ingredient.key
                            ? { ...entry, name: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    placeholder="np. Jajka"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Produkt z katalogu (opcjonalnie)</Label>
                  <select
                    className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm"
                    value={ingredient.productId}
                    onChange={(event) =>
                      setIngredients((current) =>
                        current.map((entry) =>
                          entry.key === ingredient.key
                            ? { ...entry, productId: event.target.value }
                            : entry,
                        ),
                      )
                    }
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
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Ilość</Label>
                  <Input
                    value={ingredient.quantity}
                    onChange={(event) =>
                      setIngredients((current) =>
                        current.map((entry) =>
                          entry.key === ingredient.key
                            ? { ...entry, quantity: event.target.value }
                            : entry,
                        ),
                      )
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
                      setIngredients((current) =>
                        current.map((entry) =>
                          entry.key === ingredient.key
                            ? {
                                ...entry,
                                unit: event.target.value as IngredientUnit,
                              }
                            : entry,
                        ),
                      )
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
                      setIngredients((current) =>
                        current.map((entry) =>
                          entry.key === ingredient.key
                            ? { ...entry, note: event.target.value }
                            : entry,
                        ),
                      )
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
          <p className="border-b border-gray-100 bg-amber-50/60 px-5 py-3 text-xs text-amber-900">
            Zdjęcia kroków zapisują się od razu. Zmiana treści, kolejności albo
            liczby kroków odtwarza kroki od nowa i usuwa ich zdjęcia.
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
                className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-sm"
              />
              {recipeId && step.stepId ? (
                <RecipeStepImageField
                  kitchenId={kitchenId}
                  recipeId={recipeId}
                  stepId={step.stepId}
                  initialImage={step.image ?? null}
                  label={`Zdjęcie kroku ${index + 1}`}
                />
              ) : (
                <p className="text-xs text-gray-500">
                  Zdjęcie tego kroku dodasz po zapisaniu przepisu, w edycji.
                </p>
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
