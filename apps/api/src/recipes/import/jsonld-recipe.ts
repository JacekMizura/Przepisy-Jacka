import type { ExtractedRecipeCandidate, ExtractedRecipeStep } from './types';
import {
  finalizeCandidateGaps,
  parseIsoDurationMinutes,
  parseServings,
  readString,
  decodeHtmlEntities,
} from './shared-parse';

export type { ExtractedRecipeCandidate, ExtractedRecipeStep } from './types';

/**
 * Wyszukuje obiekty Recipe w JSON-LD (obiekt, tablica, @graph, wielowartościowe @type).
 */
export function extractRecipesFromJsonLd(
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
        candidates.push(finalizeCandidateGaps(mapRecipeNode(node)));
      }
    }
  }
  return candidates;
}

/** @deprecated Użyj extractRecipesFromJsonLd — zachowane dla kompatybilności testów. */
export function extractRecipesFromHtml(
  html: string,
): ExtractedRecipeCandidate[] {
  return extractRecipesFromJsonLd(html);
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
  const steps = readInstructions(node.recipeInstructions);

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
