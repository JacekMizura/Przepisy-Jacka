import * as cheerio from 'cheerio';
import type { Element as DomElement } from 'domhandler';

import type { ExtractedRecipeCandidate, ExtractedRecipeStep } from './types';
import {
  collapseWhitespace,
  finalizeCandidateGaps,
  splitTipFromInstruction,
} from './shared-parse';

const NOISE_SELECTOR = [
  'nav',
  'header',
  'footer',
  'aside',
  '.comments',
  '#comments',
  '.comment',
  '.related',
  '.related-posts',
  '.share',
  '.social',
  '.ads',
  '.ad',
  '.advertisement',
  '[role="navigation"]',
  '.faq',
  '.FAQ',
  '[itemtype*="FAQPage"]',
].join(', ');

const INGREDIENT_HEADING =
  /składniki|skladniki|ingredients|co\s+będzie\s+potrzebne|needed/i;
const STEPS_HEADING =
  /przygotowanie|przygotuj|instrukcje|instructions|sposób\s+przygotowania|wykonanie|kroki|method|directions/i;

function isHeadingTag(tagName: string | undefined): boolean {
  const tag = (tagName || '').toLowerCase();
  return /^h[1-6]$/.test(tag);
}

function tagNameOf(node: DomElement | undefined): string | undefined {
  return node?.tagName;
}

/**
 * Ogólny parser HTML: wyraźne nagłówki sekcji składników i przygotowania.
 * Nie uznaje samego tytułu / og:description za sukces.
 */
export function extractRecipesFromGenericHtml(
  html: string,
): ExtractedRecipeCandidate[] {
  const $ = cheerio.load(html);
  $(NOISE_SELECTOR).remove();
  $('script, style, noscript, svg').remove();

  const article = $('article').first();
  const main = $('main').first();
  const root =
    article.length > 0 ? article : main.length > 0 ? main : $('body');

  const name =
    collapseWhitespace(root.find('h1').first().text()) ||
    collapseWhitespace($('h1').first().text());

  const ogDescription = collapseWhitespace(
    $('meta[property="og:description"]').attr('content') ?? '',
  );

  let ingredientLines: string[] = [];
  let steps: ExtractedRecipeStep[] = [];
  const unassigned: string[] = [];

  root.find('h1,h2,h3,h4').each((_, el) => {
    const headingText = collapseWhitespace($(el).text());
    if (!headingText) return;

    if (INGREDIENT_HEADING.test(headingText) && ingredientLines.length === 0) {
      ingredientLines = collectListAfter($, el);
      return;
    }
    if (STEPS_HEADING.test(headingText) && steps.length === 0) {
      steps = collectStepsAfter($, el);
    }
  });

  if (ingredientLines.length === 0) {
    root.find('ul, ol').each((_, list) => {
      const prev = collapseWhitespace(
        $(list).prevAll('h2,h3,h4,p,strong').first().text(),
      );
      if (INGREDIENT_HEADING.test(prev)) {
        ingredientLines = $(list)
          .find('li')
          .map((__, li) => collapseWhitespace($(li).text()))
          .get()
          .filter(Boolean);
      }
    });
  }

  if (steps.length === 0) {
    root.find('ol').each((_, list) => {
      const prev = collapseWhitespace(
        $(list).prevAll('h2,h3,h4,p,strong').first().text(),
      );
      if (STEPS_HEADING.test(prev) || steps.length === 0) {
        const collected: ExtractedRecipeStep[] = [];
        $(list)
          .find('li')
          .each((index, li) => {
            const text = collapseWhitespace($(li).text());
            if (!text) return;
            const split = splitTipFromInstruction(text);
            collected.push({
              title: null,
              instruction: split.instruction,
              tip: split.tip,
              sortOrder: index,
            });
          });
        if (collected.length >= 2) {
          steps = collected;
        }
      }
    });
  }

  root.find('p').each((_, p) => {
    if ($(p).parents(NOISE_SELECTOR).length) return;
    const text = collapseWhitespace($(p).text());
    if (!text || text.length < 40) return;
    const already =
      ingredientLines.some((line) => text.includes(line)) ||
      steps.some((step) => text.includes(step.instruction.slice(0, 40)));
    if (
      !already &&
      !INGREDIENT_HEADING.test(text) &&
      !STEPS_HEADING.test(text)
    ) {
      if (ogDescription && text === ogDescription) return;
      unassigned.push(text);
    }
  });

  if (!name) {
    return [];
  }
  if (ingredientLines.length === 0 && steps.length === 0) {
    return [];
  }

  return [
    finalizeCandidateGaps({
      name,
      description: null,
      servings: null,
      servingsRaw: null,
      servingsAmbiguous: false,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      sourceAuthor: null,
      sourceCategories: [],
      ingredientLines,
      steps,
      warnings: [],
      gaps: [],
      unassignedFragments: unassigned.slice(0, 20),
    }),
  ];
}

function collectListAfter(
  $: cheerio.CheerioAPI,
  heading: DomElement,
): string[] {
  const lines: string[] = [];
  let node = $(heading).next();
  for (let i = 0; i < 12 && node.length; i++) {
    const el = node.get(0);
    if (el && isHeadingTag(tagNameOf(el))) break;
    if (node.is('ul, ol')) {
      node.find('li').each((_, li) => {
        const text = collapseWhitespace($(li).text());
        if (text) lines.push(text);
      });
      break;
    }
    node = node.next();
  }
  return lines;
}

function collectStepsAfter(
  $: cheerio.CheerioAPI,
  heading: DomElement,
): ExtractedRecipeStep[] {
  const steps: ExtractedRecipeStep[] = [];
  let node = $(heading).next();
  for (let i = 0; i < 40 && node.length; i++) {
    const el = node.get(0);
    if (el && isHeadingTag(tagNameOf(el))) {
      const text = collapseWhitespace(node.text());
      if (INGREDIENT_HEADING.test(text)) break;
      const title = text.replace(/^Krok\s+\d+\s*[:.\-–—]?\s*/i, '').trim();
      const instructionParts: string[] = [];
      let tip: string | null = null;
      let cursor = node.next();
      while (cursor.length) {
        const cEl = cursor.get(0);
        if (cEl && isHeadingTag(tagNameOf(cEl))) break;
        if (cursor.is('p, div')) {
          const t = collapseWhitespace(cursor.text());
          if (/^(Porada|Tip|Wskazówka)/i.test(t)) {
            tip = t.replace(/^(Porada(?:\s*\d+)?|Tip|Wskazówka)\s*:\s*/i, '');
          } else if (t) {
            instructionParts.push(t);
          }
        }
        if (cursor.is('ol, ul')) break;
        cursor = cursor.next();
      }
      if (instructionParts.length) {
        steps.push({
          title: title || null,
          instruction: instructionParts.join('\n\n'),
          tip,
          sortOrder: steps.length,
        });
      }
      node = cursor.length ? cursor : node.next();
      continue;
    }
    if (node.is('ol')) {
      node.find('li').each((_, li) => {
        const text = collapseWhitespace($(li).text());
        if (!text) return;
        const split = splitTipFromInstruction(text);
        steps.push({
          title: null,
          instruction: split.instruction,
          tip: split.tip,
          sortOrder: steps.length,
        });
      });
      break;
    }
    if (node.is('p')) {
      const text = collapseWhitespace(node.text());
      if (text) {
        const split = splitTipFromInstruction(text);
        steps.push({
          title: null,
          instruction: split.instruction,
          tip: split.tip,
          sortOrder: steps.length,
        });
      }
    }
    node = node.next();
  }
  return steps;
}
