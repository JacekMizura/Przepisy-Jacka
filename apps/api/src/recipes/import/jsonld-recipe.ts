export type ExtractedRecipeStep = {
  title: string | null;
  instruction: string;
  tip: string | null;
  sortOrder: number;
};

export type ExtractedRecipeCandidate = {
  name: string;
  description: string | null;
  servings: number | null;
  servingsRaw: string | null;
  servingsAmbiguous: boolean;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  sourceAuthor: string | null;
  sourceCategories: string[];
  ingredientLines: string[];
  steps: ExtractedRecipeStep[];
  warnings: string[];
  gaps: string[];
};

/**
 * Wyszukuje obiekty Recipe w JSON-LD (obiekt, tablica, @graph, wielowartościowe @type).
 */
export function extractRecipesFromHtml(
  html: string,
): ExtractedRecipeCandidate[] {
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];

  const candidates: ExtractedRecipeCandidate[] = [];
  for (const match of scripts) {
    const raw = (match[1] ?? '').trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      continue;
    }
    for (const node of flattenLdNodes(parsed)) {
      if (isRecipeNode(node)) {
        candidates.push(mapRecipeNode(node));
      }
    }
  }
  return candidates;
}

function flattenLdNodes(input: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (value: unknown): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    out.push(obj);
    if (obj['@graph'] !== undefined) {
      visit(obj['@graph']);
    }
  };
  visit(input);
  return out;
}

function isRecipeNode(node: Record<string, unknown>): boolean {
  const typeValue = node['@type'];
  if (typeof typeValue === 'string') {
    return typeEndsWithRecipe(typeValue);
  }
  if (Array.isArray(typeValue)) {
    return typeValue.some(
      (item) => typeof item === 'string' && typeEndsWithRecipe(item),
    );
  }
  return false;
}

function typeEndsWithRecipe(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'recipe' ||
    normalized.endsWith('/recipe') ||
    normalized.endsWith('#recipe')
  );
}

function mapRecipeNode(
  node: Record<string, unknown>,
): ExtractedRecipeCandidate {
  const warnings: string[] = [];
  const gaps: string[] = [];

  const name = readString(node.name)?.trim() ?? '';
  if (!name) {
    gaps.push('Brak nazwy przepisu w danych strukturalnych.');
  }

  const description = readString(node.description)?.trim() || null;

  const servingsParsed = parseServings(node.recipeYield ?? node.yield);
  if (servingsParsed.raw && servingsParsed.value === null) {
    warnings.push(
      `Liczba porcji jest niejednoznaczna („${servingsParsed.raw}”) — ustal ją przed zapisem.`,
    );
  }
  if (!servingsParsed.raw) {
    gaps.push('Brak liczby porcji w źródle.');
  }

  const prepTimeMinutes = parseIsoDurationMinutes(node.prepTime);
  const cookTimeMinutes = parseIsoDurationMinutes(
    node.cookTime ?? node.totalTime,
  );
  if (node.prepTime === undefined) {
    gaps.push('Brak czasu przygotowania.');
  }
  if (node.cookTime === undefined && node.totalTime === undefined) {
    gaps.push('Brak czasu gotowania.');
  }

  const sourceAuthor = readAuthor(node.author);
  const sourceCategories = readCategories(node.recipeCategory ?? node.keywords);

  const ingredientLines = readIngredientLines(node.recipeIngredient);
  if (ingredientLines.length === 0) {
    gaps.push('Brak listy składników.');
  }

  const steps = readInstructions(node.recipeInstructions);
  if (steps.length === 0) {
    gaps.push('Brak instrukcji przygotowania.');
  }

  return {
    name: name || 'Zaimportowany przepis',
    description,
    servings: servingsParsed.value,
    servingsRaw: servingsParsed.raw,
    servingsAmbiguous: Boolean(
      servingsParsed.raw && servingsParsed.value === null,
    ),
    prepTimeMinutes,
    cookTimeMinutes,
    sourceAuthor,
    sourceCategories,
    ingredientLines,
    steps,
    warnings,
    gaps,
  };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (match, code: string) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => {
      const value = Number.parseInt(hex, 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') return decodeHtmlEntities(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj['@value'] === 'string') {
      return decodeHtmlEntities(obj['@value']);
    }
    if (typeof obj.name === 'string') {
      return decodeHtmlEntities(obj.name);
    }
  }
  return null;
}

function readAuthor(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = readAuthor(item);
      if (name) return name;
    }
    return null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return readString(obj.name)?.trim() || null;
  }
  return null;
}

function readCategories(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    return value
      .split(/[,;|/]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.map((item) => readString(item)?.trim() ?? '').filter(Boolean);
  }
  return [];
}

function readIngredientLines(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    return value
      .split(/\n+/)
      .map((line) => decodeHtmlEntities(line.trim()))
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return decodeHtmlEntities(item.trim());
        if (item && typeof item === 'object') {
          return (
            readString((item as Record<string, unknown>).text)?.trim() ??
            readString((item as Record<string, unknown>).name)?.trim() ??
            ''
          );
        }
        return '';
      })
      .filter(Boolean);
  }
  return [];
}

function readInstructions(value: unknown): ExtractedRecipeStep[] {
  const steps: ExtractedRecipeStep[] = [];
  let sortOrder = 0;

  const pushStep = (
    instruction: string,
    title: string | null,
    tip: string | null,
  ) => {
    const text = instruction.trim();
    if (!text) return;
    steps.push({
      title: title?.trim() || null,
      instruction: text,
      tip: tip?.trim() || null,
      sortOrder: sortOrder++,
    });
  };

  const visit = (node: unknown, sectionTitle: string | null): void => {
    if (!node) return;
    if (typeof node === 'string') {
      for (const part of node.split(/\n+/)) {
        pushStep(decodeHtmlEntities(part), sectionTitle, null);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, sectionTitle);
      return;
    }
    if (typeof node !== 'object') return;

    const obj = node as Record<string, unknown>;
    const typeValue = obj['@type'];
    const types = Array.isArray(typeValue)
      ? typeValue.map(String)
      : typeof typeValue === 'string'
        ? [typeValue]
        : [];

    const isSection = types.some((type) =>
      type.toLowerCase().includes('howtosection'),
    );
    const isStep = types.some((type) =>
      type.toLowerCase().includes('howtostep'),
    );

    if (isSection) {
      const title =
        readString(obj.name) ?? readString(obj.headline) ?? sectionTitle;
      visit(obj.itemListElement ?? obj.steps ?? obj.supply, title);
      return;
    }

    if (isStep || obj.text !== undefined || obj.itemListElement === undefined) {
      const instruction =
        readString(obj.text) ?? readString(obj.description) ?? '';
      const tip =
        readString(obj.tip) ??
        readString(obj.notes) ??
        readString(obj.comment) ??
        null;
      const stepName =
        readString(obj.text) || readString(obj.description)
          ? readString(obj.name)
          : null;
      const titleParts = [sectionTitle, stepName].filter(
        (part): part is string => Boolean(part && part.trim()),
      );
      pushStep(
        instruction || readString(obj.name) || '',
        titleParts.join(' · ') || null,
        tip,
      );
      return;
    }

    visit(obj.itemListElement, sectionTitle);
  };

  visit(value, null);
  return steps;
}

function parseServings(value: unknown): {
  value: number | null;
  raw: string | null;
} {
  if (value === null || value === undefined) {
    return { value: null, raw: null };
  }
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return { value, raw: String(value) };
  }
  if (Array.isArray(value)) {
    return parseServings(value[0]);
  }
  const raw = readString(value)?.trim() ?? null;
  if (!raw) {
    return { value: null, raw: null };
  }
  if (/^\d+$/.test(raw)) {
    const num = Number(raw);
    return num > 0 ? { value: num, raw } : { value: null, raw };
  }
  const withLabel = raw.match(
    /^(\d+)\s*(porcje|porcja|porcji|servings?|people)$/i,
  );
  if (withLabel?.[1]) {
    const num = Number(withLabel[1]);
    return num > 0 ? { value: num, raw } : { value: null, raw };
  }
  return { value: null, raw };
}

function parseIsoDurationMinutes(value: unknown): number | null {
  const raw = readString(value)?.trim();
  if (!raw) return null;
  // ISO 8601 duration e.g. PT1H30M
  const match = raw.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i,
  );
  if (!match) {
    return null;
  }
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const total =
    days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60);
  return total > 0 ? total : null;
}
