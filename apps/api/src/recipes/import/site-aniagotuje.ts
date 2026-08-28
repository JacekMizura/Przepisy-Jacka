import * as cheerio from 'cheerio';

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

  const description =
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
