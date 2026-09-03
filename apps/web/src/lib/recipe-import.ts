import type { components } from "@moja-kuchnia/api-client";

type Preview = components["schemas"]["RecipeImportPreviewDto"];
type Candidate = components["schemas"]["ImportedRecipeCandidateDto"];
type RecipeDetail = components["schemas"]["RecipeDetailDto"];
type CreateRecipeDto = components["schemas"]["CreateRecipeDto"];

export type ImportReviewState = {
  sourceUrl: string | null;
  importIdempotencyKey: string;
  importedAt: string;
  candidate: Candidate;
  existingFromSameSource: Preview["existingFromSameSource"];
  extractionMethod: string | null;
  fromUrlFetch: boolean;
};

/** Buduje sztuczny RecipeDetail do wypełnienia istniejącego RecipeForm. */
export function candidateToRecipeDetailDraft(
  kitchenId: string,
  state: ImportReviewState,
): RecipeDetail {
  const candidate = state.candidate;
  const now = new Date().toISOString();

  return {
    id: "00000000-0000-4000-8000-000000000000",
    kitchenId,
    name: candidate.name,
    description: candidate.description,
    servings: candidate.servings && candidate.servings > 0 ? candidate.servings : 1,
    prepTimeMinutes: candidate.prepTimeMinutes,
    cookTimeMinutes: candidate.cookTimeMinutes,
    difficulty: "easy",
    tags: [],
    categories: state.candidate.suggestedCategoryIds.map((id) => ({
      id,
      name: "Kategoria",
    })),
    visibility: "private",
    author: { id: "import", name: "Import" },
    coverImage: null,
    createdAt: now,
    updatedAt: now,
    preparationPlanEnabled: false,
    sourceUrl: state.sourceUrl,
    sourceAuthor: candidate.sourceAuthor,
    importedAt: state.importedAt,
    ingredientGroups: [],
    ingredients: candidate.ingredients.map((ingredient, index) => ({
      id: `import-ing-${index}`,
      groupId: null,
      name: ingredient.name || ingredient.rawText,
      quantity: ingredient.quantity,
      unit: ingredient.unit ?? "to_taste",
      note:
        ingredient.rawText && ingredient.rawText !== ingredient.name
          ? ingredient.rawText
          : null,
      productId: ingredient.suggestedProductId,
      sortOrder: index,
    })),
    steps:
      candidate.steps.length > 0
        ? candidate.steps.map((step) => ({
            id: `import-step-${step.sortOrder}`,
            title: step.title,
            instruction: step.instruction,
            tip: step.tip,
            durationMinutes: null,
            sortOrder: step.sortOrder,
            image: null,
            ingredientIds: [],
            activeWorkMinutes: null,
            waitMinutes: null,
            timerEnabled: false,
            dependsOnStepIds: [],
          }))
        : [
            {
              id: "import-step-0",
              title: null,
              instruction: "",
              tip: null,
              durationMinutes: null,
              sortOrder: 0,
              image: null,
              ingredientIds: [],
              activeWorkMinutes: null,
              waitMinutes: null,
              timerEnabled: false,
              dependsOnStepIds: [],
            },
          ],
  };
}

export function buildImportCreatePayload(
  body: CreateRecipeDto,
  state: ImportReviewState,
): CreateRecipeDto {
  return {
    ...body,
    visibility: body.visibility ?? "private",
    sourceUrl: state.sourceUrl,
    sourceAuthor: state.candidate.sourceAuthor,
    importedAt: state.importedAt,
    importIdempotencyKey: state.importIdempotencyKey,
    categoryIds:
      body.categoryIds && body.categoryIds.length > 0
        ? body.categoryIds
        : state.candidate.suggestedCategoryIds,
  };
}

export function collectImportWarnings(candidate: Candidate): string[] {
  const items = [
    ...candidate.gaps,
    ...candidate.warnings,
    ...candidate.ingredients.flatMap((ingredient) => ingredient.warnings),
  ];
  if (candidate.servingsAmbiguous && candidate.servingsRaw) {
    items.push(
      `Porcje ze źródła: „${candidate.servingsRaw}” — potwierdź liczbę porcji do zjedzenia.`,
    );
  }
  if (candidate.unmatchedSourceCategories.length > 0) {
    items.push(
      `Nie dopasowano kategorii źródła: ${candidate.unmatchedSourceCategories.join(", ")}. Nie utworzono nowych nazw.`,
    );
  }
  if ((candidate.unassignedFragments?.length ?? 0) > 0) {
    items.push(
      `Pozostawiono ${candidate.unassignedFragments!.length} fragment(ów) do ręcznego opracowania.`,
    );
  }
  return [...new Set(items)];
}
