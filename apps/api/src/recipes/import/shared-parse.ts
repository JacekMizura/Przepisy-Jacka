export function decodeHtmlEntities(input: string): string {
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

export function readString(value: unknown): string | null {
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

export function parseServings(value: unknown): {
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

export function parseIsoDurationMinutes(value: unknown): number | null {
  const raw = readString(value)?.trim();
  if (!raw) return null;
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

export function parseHumanDurationMinutes(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  const iso = parseIsoDurationMinutes(text);
  if (iso !== null) return iso;

  let total = 0;
  const hours = text.match(/(\d+)\s*(?:h|godz|godzin[ay]?)/i);
  const minutes = text.match(/(\d+)\s*(?:min|minut[ay]?)/i);
  if (hours?.[1]) total += Number(hours[1]) * 60;
  if (minutes?.[1]) total += Number(minutes[1]);
  if (total > 0) return total;
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return n > 0 ? n : null;
  }
  return null;
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function splitTipFromInstruction(raw: string): {
  instruction: string;
  tip: string | null;
} {
  const tipMatch = raw.match(
    /(?:^|\n|[.!?]\s+)(?:Porada(?:\s*\d+)?|Tip|Wskazówka)\s*:\s*([\s\S]+)$/i,
  );
  if (!tipMatch) {
    return { instruction: collapseWhitespace(raw), tip: null };
  }
  const tip = collapseWhitespace(tipMatch[1] ?? '');
  const instruction = collapseWhitespace(raw.slice(0, tipMatch.index).trim());
  return {
    instruction: instruction || collapseWhitespace(raw),
    tip: tip || null,
  };
}

/** Przepis użyteczny: nazwa + (składniki lub kroki). Sam tytuł / og:description nie wystarcza. */
export function isUsableRecipeCandidate(candidate: {
  name: string;
  ingredientLines: string[];
  steps: { instruction: string }[];
}): boolean {
  const name = candidate.name.trim();
  if (!name || name.length < 2) return false;
  const hasIngredients = candidate.ingredientLines.some(
    (line) => line.trim().length > 0,
  );
  const hasSteps = candidate.steps.some(
    (step) => step.instruction.trim().length > 0,
  );
  return hasIngredients || hasSteps;
}

export function isSocialMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return (
    host === 'instagram.com' ||
    host.endsWith('.instagram.com') ||
    host === 'tiktok.com' ||
    host.endsWith('.tiktok.com') ||
    host === 'vm.tiktok.com'
  );
}

export function finalizeCandidateGaps(
  candidate: import('./types').ExtractedRecipeCandidate,
): import('./types').ExtractedRecipeCandidate {
  const gaps = [...candidate.gaps];
  if (!candidate.name.trim()) {
    gaps.push('Brak nazwy przepisu.');
  }
  if (candidate.ingredientLines.length === 0) {
    gaps.push('Brak listy składników.');
  }
  if (candidate.steps.length === 0) {
    gaps.push('Brak instrukcji przygotowania.');
  }
  if (!candidate.servingsRaw) {
    gaps.push('Brak liczby porcji w źródle.');
  }
  return { ...candidate, gaps: [...new Set(gaps)] };
}
