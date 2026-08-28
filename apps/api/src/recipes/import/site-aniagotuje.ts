import * as cheerio from 'cheerio';
import type { Element as DomElement } from 'domhandler';

import type { ExtractedRecipeCandidate, ExtractedRecipeStep } from './types';
import {
  collapseWhitespace,
  finalizeCandidateGaps,
  parseHumanDurationMinutes,
  parseIsoDurationMinutes,
  parseServings,
} from './shared-parse';

export function isAniaGotujeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return host === 'aniagotuje.pl' || host.endsWith('.aniagotuje.pl');
}

/**
 * Parser HTML Ani Gotuje — struktura article Recipe / składniki / kroki z poradami.
 * Nie hardkoduje treści konkretnego przepisu.
 */
export function extractAniaGotujeRecipes(
  html: string,
): ExtractedRecipeCandidate[] {
  const $ = cheerio.load(html);
  const article = $(
    'article[itemtype*="Recipe"], article.post, article',
  ).first();
  if (!article.length) {
    return [];
  }

  const warnings: string[] = [];
  const name =
    collapseWhitespace(
      article.find('h1[itemprop="name"], h1').first().text(),
    ) ||
    collapseWhitespace(
      article.find('meta[itemprop="name"]').attr('content') ?? '',
    );

  let description =
    collapseWhitespace(
      article.find('meta[itemprop="description"]').attr('content') ?? '',
    ) ||
    collapseWhitespace(article.find('.article-intro p').first().text()) ||
    null;

  const author =
    collapseWhitespace(
      article.find('[itemprop="author"] [itemprop="name"]').attr('content') ??
        '',
    ) ||
    collapseWhitespace(
      article
        .find('[itemprop="author"] meta[itemprop="name"]')
        .attr('content') ?? '',
    ) ||
    null;

  const yieldRaw =
    article.find('meta[itemprop="recipeYield"]').attr('content')?.trim() ||
    (() => {
      const info = article.find('.recipe-info').text();
      const match = info.match(/Liczba porcji:\s*([^\n<]+)/i);
      return match?.[1]?.trim() ?? null;
    })();
  const servingsParsed = parseServings(yieldRaw);
  if (servingsParsed.raw && servingsParsed.value === null) {
    warnings.push(
      `Liczba porcji jest niejednoznaczna („${servingsParsed.raw}”) — ustal ją przed zapisem.`,
    );
  }

  const prepMeta = article.find('meta[itemprop="prepTime"]').attr('content');
  const cookMeta = article.find('meta[itemprop="cookTime"]').attr('content');
  let prepTimeMinutes = parseIsoDurationMinutes(prepMeta ?? null);
  let cookTimeMinutes = parseIsoDurationMinutes(cookMeta ?? null);

  const infoText = article.find('.recipe-info').text();
  if (prepTimeMinutes === null) {
    const prepMatch = infoText.match(/Czas przygotowania:\s*([^\n]+)/i);
    if (prepMatch?.[1]) {
      prepTimeMinutes = parseHumanDurationMinutes(prepMatch[1]);
    }
  }
  if (cookTimeMinutes === null) {
    const cookMatch = infoText.match(
      /Czas (?:pasteryzacji|gotowania|pieczenia):\s*([^\n]+)/i,
    );
    if (cookMatch?.[1]) {
      cookTimeMinutes = parseHumanDurationMinutes(cookMatch[1]);
      warnings.push(
        `Czas „${cookMatch[0].split(':')[0]}” zapisano jako czas gotowania — sprawdź znaczenie.`,
      );
    }
  }

  const categories: string[] = [];
  const cat = article.find('meta[itemprop="recipeCategory"]').attr('content');
  if (cat)
    categories.push(
      ...cat
        .split(/[,;]/)
        .map((c) => c.trim())
        .filter(Boolean),
    );

  const ingredientLines: string[] = [];
  article.find('[itemprop="recipeIngredient"]').each((_, el) => {
    const node = $(el);
    const ingName = collapseWhitespace(node.find('.ingredient-name').text());
    const qty = collapseWhitespace(node.find('.ingredient-qty').text());
    if (ingName || qty) {
      const line = collapseWhitespace(`${ingName} ${qty}`);
      ingredientLines.push(line);
      if (/\s[—–-]\s*\d/.test(line) || /\d+\s*[—–-]\s*\d+/.test(line)) {
        warnings.push(
          `Składnik „${line}” może zawierać alternatywny zapis ilości — sprawdź przed zapisem.`,
        );
      }
      return;
    }
    const text = collapseWhitespace(node.text());
    if (text) ingredientLines.push(text);
  });

  const steps: ExtractedRecipeStep[] = [];
  article
    .find(
      '.step[itemprop="recipeInstructions"], [itemprop="recipeInstructions"][itemtype*="HowToStep"]',
    )
    .each((_, el) => {
      const step = $(el);
      const nameFromProp = collapseWhitespace(
        step.find('[itemprop="name"]').first().text(),
      );
      const rawName =
        nameFromProp ||
        collapseWhitespace(step.find('.step-name').first().text());
      const title = rawName.replace(/^Krok\s+\d+\s*:\s*/i, '').trim() || null;

      const textEl = step.find('.step-text, [itemprop="text"]').first();
      const tipParts: string[] = [];
      textEl.find('.recipe-tip').each((__, tipEl) => {
        tipParts.push(
          collapseWhitespace($(tipEl).text()).replace(
            /^(Porada(?:\s*\d+)?|Tip|Wskazówka)\s*:\s*/i,
            '',
          ),
        );
      });
      textEl.find('.recipe-tip').remove();
      // Usuń placeholdery zdjęć z tekstu kroku
      textEl
        .find('.img-placeholder, img, .ads-slot-article, .ad-slot')
        .remove();

      const instruction = collapseWhitespace(textEl.text());
      if (!instruction) return;

      steps.push({
        title,
        instruction,
        tip: tipParts.filter(Boolean).join('\n\n') || null,
        sortOrder: steps.length,
      });
    });

  if (steps.length === 0) {
    const prose = extractAniaProsePreparation($, article);
    if (prose) {
      steps.push(prose.step);
      warnings.push(...prose.warnings);
      if (prose.authorNotes.length > 0) {
        const notesBlock = prose.authorNotes.join('\n\n');
        description = description
          ? `${description}\n\n${notesBlock}`
          : notesBlock;
      }
    }
  }

  if (!name && ingredientLines.length === 0 && steps.length === 0) {
    return [];
  }

  return [
    finalizeCandidateGaps({
      name: name || 'Zaimportowany przepis',
      description,
      servings: servingsParsed.value,
      servingsRaw: servingsParsed.raw,
      servingsAmbiguous: Boolean(
        servingsParsed.raw && servingsParsed.value === null,
      ),
      prepTimeMinutes,
      cookTimeMinutes,
      sourceAuthor: author,
      sourceCategories: categories,
      ingredientLines,
      steps,
      warnings,
      gaps: [],
    }),
  ];
}

const ANIA_PROSE_NOISE =
  /^(czas przygotowania|czas pasteryzacji|czas gotowania|czas pieczenia|liczba porcji|wartość energetyczna|dieta:|składniki\s*:|kopiuj|ukryj zdjęcia|średnia\s+\d)/i;

/** Istotne uwagi autora (miary / waga) — poza głównymi instrukcjami. */
const ANIA_AUTHOR_NOTE = /szklanka ma u mnie|warzywa ważone były/i;

/** Meta / kalorie / marketing korpusu — pomijane. */
const ANIA_PROSE_META =
  /kalorie policzone|orientacyjna ilość kalorii|użyte słoiki\s*:|nie trzeba jednak stosować się do wytycznych|wagi podawane są po to/i;

function isAniaAuthorNote(text: string): boolean {
  return ANIA_AUTHOR_NOTE.test(text.trim());
}

function isAniaProseNoise(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 20) return true;
  if (ANIA_PROSE_NOISE.test(trimmed)) return true;
  if (ANIA_PROSE_META.test(trimmed)) return true;
  if (/^zobacz podobne/i.test(trimmed)) return true;
  return false;
}

function shouldStopAniaProseWalk(node: cheerio.Cheerio<DomElement>): boolean {
  if (
    node.is(
      '.comments, #comments, .related, .related-posts, .faq, [itemtype*="FAQPage"], .share, .rate-box, .post-rating',
    )
  ) {
    return true;
  }
  const heading = collapseWhitespace(
    node.is('h1,h2,h3,h4') ? node.text() : node.find('h2,h3,h4').first().text(),
  );
  if (/zobacz podobne|polecane przepisy|komentarz/i.test(heading)) {
    return true;
  }
  return false;
}

/**
 * Gdy brak HowToStep — zbierz akapity przygotowania po składnikach (bez wstępu/FAQ/komentarzy).
 */
function extractAniaProsePreparation(
  $: cheerio.CheerioAPI,
  article: cheerio.Cheerio<DomElement>,
): {
  step: ExtractedRecipeStep;
  warnings: string[];
  authorNotes: string[];
} | null {
  const start = article.find('.post-ingredients').first();
  if (!start.length) {
    return null;
  }

  const paragraphs: string[] = [];
  const tipParts: string[] = [];
  const authorNotes: string[] = [];

  start.nextAll().each((_, el) => {
    const node = $(el);
    if (shouldStopAniaProseWalk(node)) {
      return false;
    }
    if (node.is('.ads-slot-article, .ad, .advertisement, .img-placeholder')) {
      return;
    }

    const blocks = node.is('p') ? node : node.find('p');
    blocks.each((__, p) => {
      const tipNode = $(p);
      if (
        tipNode.is('.recipe-tip') ||
        tipNode.hasClass('recipe-tip') ||
        tipNode.closest('.recipe-tip').length > 0
      ) {
        const tip = collapseWhitespace(tipNode.text()).replace(
          /^(Porada(?:\s*\d+)?|Tip|Wskazówka)\s*:\s*/i,
          '',
        );
        if (tip && !isAniaProseNoise(tip) && !isAniaAuthorNote(tip)) {
          tipParts.push(tip);
        }
        return;
      }
      const text = collapseWhitespace(tipNode.text());
      if (!text) return;
      if (isAniaAuthorNote(text)) {
        authorNotes.push(text);
        return;
      }
      if (isAniaProseNoise(text)) return;
      if (/^(porada|tip|wskazówka)\s*:/i.test(text)) {
        tipParts.push(
          text.replace(/^(Porada(?:\s*\d+)?|Tip|Wskazówka)\s*:\s*/i, ''),
        );
        return;
      }
      paragraphs.push(text);
    });

    if (!blocks.length && node.is('ol, ul')) {
      node.find('li').each((__, li) => {
        const text = collapseWhitespace($(li).text());
        if (!text) return;
        if (isAniaAuthorNote(text)) {
          authorNotes.push(text);
          return;
        }
        if (!isAniaProseNoise(text)) paragraphs.push(text);
      });
    }
  });

  if (paragraphs.length === 0) {
    return null;
  }

  return {
    step: {
      title: null,
      instruction: paragraphs.join('\n\n'),
      tip: tipParts.filter(Boolean).join('\n\n') || null,
      sortOrder: 0,
    },
    warnings: [
      'Źródło nie wydziela osobnych kroków przygotowania — treść zapisano jako jeden edytowalny krok (akapity zachowane).',
    ],
    authorNotes,
  };
}
