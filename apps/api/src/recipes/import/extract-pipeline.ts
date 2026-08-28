import { extractRecipesFromGenericHtml } from './generic-html';
import { extractRecipesFromJsonLd } from './jsonld-recipe';
import {
  extractRecipesFromMicrodata,
  extractRecipesFromRdfa,
} from './microdata-rdfa';
import { extractRecipeFromPastedText } from './pasted-text';
import { isSocialMediaHost, isUsableRecipeCandidate } from './shared-parse';
import { extractAniaGotujeRecipes, isAniaGotujeHost } from './site-aniagotuje';
import type { ExtractionResult } from './types';
import { MAX_HTML_PARSE_CHARS, MAX_PASTED_TEXT_CHARS } from './types';

function hostnameOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Jedna pobrana odpowiedź HTML → kolejno JSON-LD, microdata/RDFa, parser witryny, ogólny HTML.
 */
export function extractRecipesFromFetchedHtml(
  html: string,
  finalUrl: string,
): ExtractionResult {
  const truncated =
    html.length > MAX_HTML_PARSE_CHARS
      ? html.slice(0, MAX_HTML_PARSE_CHARS)
      : html;
  const host = hostnameOf(finalUrl);

  const jsonld = extractRecipesFromJsonLd(truncated).filter(
    isUsableRecipeCandidate,
  );
  if (jsonld.length > 0) {
    return {
      method: 'jsonld',
      candidates: jsonld,
      suggestPasteCaption: false,
      message: null,
    };
  }

  // Dedykowany parser witryny przed ogólnym microdata — lepiej zachowuje porady / strukturę.
  if (isAniaGotujeHost(host)) {
    const ania = extractAniaGotujeRecipes(truncated).filter(
      isUsableRecipeCandidate,
    );
    if (ania.length > 0 && ania.some((c) => c.steps.length > 0)) {
      return {
        method: 'site:aniagotuje',
        candidates: ania,
        suggestPasteCaption: false,
        message: null,
      };
    }
  }

  const microdata = extractRecipesFromMicrodata(truncated).filter(
    isUsableRecipeCandidate,
  );
  if (microdata.length > 0) {
    return {
      method: 'microdata',
      candidates: microdata,
      suggestPasteCaption: false,
      message: null,
    };
  }

  const rdfa = extractRecipesFromRdfa(truncated).filter(
    isUsableRecipeCandidate,
  );
  if (rdfa.length > 0) {
    return {
      method: 'rdfa',
      candidates: rdfa,
      suggestPasteCaption: false,
      message: null,
    };
  }

  if (isAniaGotujeHost(host)) {
    const ania = extractAniaGotujeRecipes(truncated).filter(
      isUsableRecipeCandidate,
    );
    if (ania.length > 0) {
      return {
        method: 'site:aniagotuje',
        candidates: ania,
        suggestPasteCaption: false,
        message: null,
      };
    }
  }

  const generic = extractRecipesFromGenericHtml(truncated).filter(
    isUsableRecipeCandidate,
  );
  if (generic.length > 0) {
    return {
      method: 'html',
      candidates: generic,
      suggestPasteCaption: false,
      message: null,
    };
  }

  if (isSocialMediaHost(host)) {
    return {
      method: null,
      candidates: [],
      suggestPasteCaption: true,
      message:
        'Nie udało się automatycznie odczytać pełnego przepisu z tego linku (Instagram/TikTok). Wklej opis posta w trybie „Wklej tekst” — link źródłowy możesz zachować.',
    };
  }

  return {
    method: null,
    candidates: [],
    suggestPasteCaption: false,
    message:
      'Na stronie nie znaleziono obsługiwanego przepisu (JSON-LD, microdata/RDFa ani czytelnych sekcji HTML).',
  };
}

export function extractRecipesFromTextInput(
  text: string,
  optionalSourceUrl?: string | null,
): ExtractionResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      method: null,
      candidates: [],
      suggestPasteCaption: false,
      message: 'Wklejony tekst jest pusty.',
    };
  }
  if (trimmed.length > MAX_PASTED_TEXT_CHARS) {
    return {
      method: null,
      candidates: [],
      suggestPasteCaption: false,
      message: `Wklejony tekst przekracza limit ${MAX_PASTED_TEXT_CHARS} znaków.`,
    };
  }

  const candidate = extractRecipeFromPastedText(trimmed);
  const host = hostnameOf(optionalSourceUrl ?? undefined);
  const socialNote = isSocialMediaHost(host)
    ? 'Import z tekstu wklejonego przez użytkownika (link społecznościowy zachowany jako źródło).'
    : 'Import z tekstu wklejonego przez użytkownika.';

  candidate.warnings = [...candidate.warnings, socialNote];

  return {
    method: 'pasted_text',
    candidates: [candidate],
    suggestPasteCaption: false,
    message: null,
  };
}
