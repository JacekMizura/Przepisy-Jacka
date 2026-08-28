const UNIT_LABELS: Record<string, string> = {
  piece: "szt.",
  gram: "g",
  kilogram: "kg",
  milliliter: "ml",
  liter: "l",
  teaspoon: "łyżeczka",
  tablespoon: "łyżka",
  cup: "szklanka",
  pinch: "szczypta",
  package: "opakowanie",
  to_taste: "do smaku",
};

function formatClipboardQuantity(
  quantity: string | number | null | undefined,
  unit: string,
): string {
  if (unit === "to_taste") {
    return UNIT_LABELS.to_taste ?? "do smaku";
  }
  let amount = "";
  if (quantity !== null && quantity !== undefined && quantity !== "") {
    const numeric = typeof quantity === "number" ? quantity : Number(quantity);
    if (Number.isFinite(numeric)) {
      amount = new Intl.NumberFormat("pl-PL", {
        maximumFractionDigits: 3,
        minimumFractionDigits: 0,
      }).format(numeric);
    } else {
      amount = String(quantity);
    }
  }
  const label = UNIT_LABELS[unit] ?? unit;
  if (!amount) {
    return label;
  }
  return `${amount}\u00A0${label}`;
}

export type RecipeClipboardIngredient = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string;
  note: string | null;
  groupId: string | null;
  sortOrder: number;
  /** Ilość już przeskalowana (np. z availability); w przeciwnym razie quantity. */
  displayQuantity?: string | null;
  displayUnit?: string;
  displayName?: string;
};

export type RecipeClipboardGroup = {
  id: string;
  name: string;
  sortOrder: number;
};

export type RecipeClipboardStep = {
  title: string | null;
  instruction: string;
  tip: string | null;
  sortOrder: number;
};

export type IngredientClipboardSection<T> = {
  key: string;
  title: string | null;
  ingredients: T[];
};

/** Sekcje składników: grupy wg sortOrder, na końcu „Pozostałe”. */
export function buildIngredientClipboardSections<
  T extends { groupId: string | null; sortOrder: number },
>(
  ingredients: T[],
  ingredientGroups: RecipeClipboardGroup[],
): IngredientClipboardSection<T>[] {
  const sortedIngredients = [...ingredients].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const groups = [...ingredientGroups].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  if (groups.length === 0) {
    return [
      {
        key: "all",
        title: null,
        ingredients: sortedIngredients,
      },
    ];
  }

  const result: IngredientClipboardSection<T>[] = [];
  for (const group of groups) {
    const groupIngredients = sortedIngredients.filter(
      (ingredient) => ingredient.groupId === group.id,
    );
    if (groupIngredients.length === 0) {
      continue;
    }
    result.push({
      key: group.id,
      title: group.name,
      ingredients: groupIngredients,
    });
  }

  const ungrouped = sortedIngredients.filter(
    (ingredient) =>
      !ingredient.groupId ||
      !groups.some((group) => group.id === ingredient.groupId),
  );
  if (ungrouped.length > 0) {
    result.push({
      key: "ungrouped",
      title: "Pozostałe",
      ingredients: ungrouped,
    });
  }

  return result;
}

function formatIngredientLine(ingredient: RecipeClipboardIngredient): string {
  const quantity = ingredient.displayQuantity ?? ingredient.quantity;
  const unit = ingredient.displayUnit ?? ingredient.unit;
  const name = ingredient.displayName ?? ingredient.name;
  const qty = formatClipboardQuantity(quantity, unit);
  const note = ingredient.note ? ` (${ingredient.note})` : "";
  return `• ${name} — ${qty}${note}`;
}

/** Tekst składników do schowka (nagłówki grup + kolejność). */
export function formatIngredientsClipboardText(
  ingredients: RecipeClipboardIngredient[],
  ingredientGroups: RecipeClipboardGroup[],
): string {
  const sections = buildIngredientClipboardSections(
    ingredients,
    ingredientGroups,
  );
  const lines: string[] = [];
  for (const section of sections) {
    if (section.title) {
      lines.push(`${section.title}:`);
    }
    for (const ingredient of section.ingredients) {
      lines.push(formatIngredientLine(ingredient));
    }
  }
  return lines.join("\n");
}

/** Tekst kroków do schowka (tytuły i wskazówki, kolejność). */
export function formatStepsClipboardText(steps: RecipeClipboardStep[]): string {
  const sorted = [...steps].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const blocks: string[] = [];
  for (let index = 0; index < sorted.length; index++) {
    const step = sorted[index];
    if (!step) {
      continue;
    }
    const heading = step.title?.trim()
      ? `Krok ${index + 1} · ${step.title.trim()}`
      : `Krok ${index + 1}`;
    const parts = [heading, step.instruction.trim()];
    const tip = step.tip?.trim();
    if (tip) {
      parts.push(`Wskazówka: ${tip}`);
    }
    blocks.push(parts.join("\n"));
  }
  return blocks.join("\n\n");
}

/** Pełne kopiowanie: składniki (z grupami) + przygotowanie (tytuły, wskazówki). */
export function formatRecipeClipboardText(input: {
  ingredients: RecipeClipboardIngredient[];
  ingredientGroups: RecipeClipboardGroup[];
  steps: RecipeClipboardStep[];
}): string {
  const ingredientsText = formatIngredientsClipboardText(
    input.ingredients,
    input.ingredientGroups,
  );
  const stepsText = formatStepsClipboardText(input.steps);
  if (!stepsText) {
    return ingredientsText;
  }
  if (!ingredientsText) {
    return `Przygotowanie:\n${stepsText}`;
  }
  return `${ingredientsText}\n\nPrzygotowanie:\n${stepsText}`;
}
