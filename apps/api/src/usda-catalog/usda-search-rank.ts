import { normalizeSearchText } from '../common/normalize';

export type UsdaSearchableEntry = {
  polishName: string;
  aliases: string[];
  descriptionOriginal: string;
  variantLabel: string;
  searchText: string;
};

export type UsdaRankedHit = {
  score: number;
  tier: number;
  processedPenalty: number;
};

const PROCESSED_RE =
  /\b(gotowan|ugotowan|pieczon|sma[zż]on|podsma[zż]on|konserw|z puszki|mielon|przypraw|spice|canned|cooked|boiled|baked|broiled|sauteed|roasted|dried|frozen|prepared|drained)\b/i;

const RAW_HINT_RE = /\b(surow|raw|fresh)\b/i;

/** Normalizacja zapytania: małe litery, bez ogonków, bez interpunkcji, zbita spacja. */
export function normalizeUsdaQuery(query: string): string {
  return normalizeSearchText(
    query
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

export function tokenizeUsdaQuery(query: string): string[] {
  return normalizeUsdaQuery(query)
    .split(' ')
    .filter((t) => t.length > 0);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i += 1) {
    let prev = row[0]!;
    row[0] = i + 1;
    for (let j = 0; j < b.length; j += 1) {
      const tmp = row[j + 1]!;
      const cost = a[i] === b[j] ? 0 : 1;
      row[j + 1] = Math.min(row[j + 1]! + 1, row[j]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length]!;
}

function fold(value: string): string {
  return normalizeUsdaQuery(value);
}

function wordsOf(value: string): string[] {
  return fold(value)
    .split(' ')
    .filter((w) => w.length > 0);
}

function tokenMatchesWord(
  token: string,
  word: string,
): 'exact' | 'prefix' | 'fuzzy' | null {
  if (word === token) return 'exact';
  if (word.startsWith(token) || token.startsWith(word)) return 'prefix';
  if (token.length >= 4 && word.length >= 4 && levenshtein(token, word) <= 1) {
    return 'fuzzy';
  }
  return null;
}

function haystackWords(entry: UsdaSearchableEntry): string[] {
  return [
    ...wordsOf(entry.polishName),
    ...entry.aliases.flatMap((a) => wordsOf(a)),
    ...wordsOf(entry.descriptionOriginal),
    ...wordsOf(entry.variantLabel),
    ...wordsOf(entry.searchText),
  ];
}

function allTokensMatch(tokens: string[], entry: UsdaSearchableEntry): boolean {
  const words = haystackWords(entry);
  return tokens.every((token) =>
    words.some((word) => tokenMatchesWord(token, word) !== null),
  );
}

export function isProcessedVariant(entry: UsdaSearchableEntry): boolean {
  const blob = `${entry.polishName} ${entry.variantLabel} ${entry.descriptionOriginal}`;
  if (RAW_HINT_RE.test(blob) && !PROCESSED_RE.test(blob)) {
    return false;
  }
  return PROCESSED_RE.test(blob);
}

/**
 * Ranking (niższy tier = lepszy):
 * 1 dokładna PL nazwa
 * 2 dokładny alias
 * 3 początek nazwy/aliasu
 * 4 wszystkie słowa w dowolnej kolejności
 * 5 częściowe / literówka
 * 6 nazwa angielska USDA
 */
export function rankUsdaEntry(
  entry: UsdaSearchableEntry,
  tokens: string[],
  rawFoldedQuery: string,
): UsdaRankedHit | null {
  if (tokens.length === 0) return null;
  if (!allTokensMatch(tokens, entry)) return null;

  const nameFolded = fold(entry.polishName);
  const aliasesFolded = entry.aliases.map(fold);
  const processedPenalty = isProcessedVariant(entry) ? 1 : 0;

  if (nameFolded === rawFoldedQuery) {
    return { score: 1000 - processedPenalty, tier: 1, processedPenalty };
  }
  if (aliasesFolded.includes(rawFoldedQuery)) {
    return { score: 900 - processedPenalty, tier: 2, processedPenalty };
  }

  const startsName =
    nameFolded.startsWith(rawFoldedQuery) ||
    tokens.every((t) => nameFolded.split(' ').some((w) => w.startsWith(t)));
  const startsAlias = aliasesFolded.some(
    (a) =>
      a.startsWith(rawFoldedQuery) ||
      tokens.every((t) => a.split(' ').some((w) => w.startsWith(t))),
  );
  if (startsName || startsAlias) {
    return { score: 800 - processedPenalty, tier: 3, processedPenalty };
  }

  const nameWords = wordsOf(entry.polishName);
  const aliasWords = entry.aliases.flatMap((a) => wordsOf(a));
  const allPlWords = [...nameWords, ...aliasWords];
  const allInPlExact = tokens.every((t) =>
    allPlWords.some((w) => w === t || w.startsWith(t)),
  );
  if (allInPlExact) {
    return { score: 700 - processedPenalty, tier: 4, processedPenalty };
  }

  const englishWords = wordsOf(entry.descriptionOriginal);
  const onlyEnglish =
    tokens.every((t) =>
      englishWords.some((w) => tokenMatchesWord(t, w) !== null),
    ) &&
    !tokens.every((t) =>
      allPlWords.some((w) => tokenMatchesWord(t, w) !== null),
    );

  if (onlyEnglish) {
    return { score: 400 - processedPenalty, tier: 6, processedPenalty };
  }

  return { score: 500 - processedPenalty, tier: 5, processedPenalty };
}

export function compareUsdaRank(a: UsdaRankedHit, b: UsdaRankedHit): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.processedPenalty !== b.processedPenalty) {
    return a.processedPenalty - b.processedPenalty;
  }
  return b.score - a.score;
}

export function filterAndRankUsdaEntries<T extends UsdaSearchableEntry>(
  entries: T[],
  query: string,
): Array<T & { rank: UsdaRankedHit }> {
  const tokens = tokenizeUsdaQuery(query);
  const rawFolded = normalizeUsdaQuery(query);
  const hits: Array<T & { rank: UsdaRankedHit }> = [];
  for (const entry of entries) {
    const rank = rankUsdaEntry(entry, tokens, rawFolded);
    if (rank) hits.push({ ...entry, rank });
  }
  hits.sort((a, b) => {
    const byRank = compareUsdaRank(a.rank, b.rank);
    if (byRank !== 0) return byRank;
    return a.polishName.localeCompare(b.polishName, 'pl');
  });
  return hits;
}
