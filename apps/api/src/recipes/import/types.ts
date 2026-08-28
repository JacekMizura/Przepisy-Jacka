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
  unassignedFragments?: string[];
};

export type ExtractionMethod =
  'jsonld' | 'microdata' | 'rdfa' | 'site:aniagotuje' | 'html' | 'pasted_text';

export type ExtractionResult = {
  method: ExtractionMethod | null;
  candidates: ExtractedRecipeCandidate[];
  /** Gdy źródło (np. Instagram) nie dało przepisu — zasugeruj wklejenie opisu. */
  suggestPasteCaption: boolean;
  message: string | null;
};

export const MAX_PASTED_TEXT_CHARS = 100_000;
export const MAX_HTML_PARSE_CHARS = 2_000_000;
