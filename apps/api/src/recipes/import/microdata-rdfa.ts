import * as cheerio from 'cheerio';
import type { Element as DomElement } from 'domhandler';

import type { ExtractedRecipeCandidate, ExtractedRecipeStep } from './types';
import {
  collapseWhitespace,
  finalizeCandidateGaps,
  parseIsoDurationMinutes,
  parseServings,
  splitTipFromInstruction,
} from './shared-parse';

type CheerioRoot = cheerio.Cheerio<DomElement>;

function typeIncludesRecipe(typeAttr: string | undefined): boolean {
  if (!typeAttr) return false;
  return typeAttr.split(/\s+/).some((part) => {
    const n = part.trim().toLowerCase();
    return n === 'recipe' || n.endsWith('/recipe') || n.endsWith('#recipe');
  });
}

function elementText($: cheerio.CheerioAPI, el: CheerioRoot): string | null {
  const content = el.attr('content');
  if (content !== undefined && content.trim()) {
    return collapseWhitespace(content);
  }
  const datetime = el.attr('datetime');
  if (datetime !== undefined && datetime.trim()) {
    return collapseWhitespace(datetime);
  }
  const text = collapseWhitespace(el.text());
  return text || null;
}

function propValue(
  $: cheerio.CheerioAPI,
  root: CheerioRoot,
  prop: string,
): string | null {
  const nodes = root.find(`[itemprop="${prop}"]`).filter((_, el) => {
    const parents = $(el).parentsUntil(root, '[itemscope]');
    return parents.length === 0;
  });
  if (nodes.length === 0) {
    const direct = root.children(`[itemprop="${prop}"]`).first();
    if (direct.length) {
      return elementText($, direct);
    }
    return null;
  }
  return elementText($, nodes.first());
}

function authorFromRoot(
  $: cheerio.CheerioAPI,
  root: CheerioRoot,
): string | null {
  const author = root.find('[itemprop="author"]').first();
  if (!author.length) return null;
  const nestedName = author.find('[itemprop="name"]').first();
  if (nestedName.length) {
    return elementText($, nestedName);
  }
  return elementText($, author);
}

function categoriesFromRoot(
  $: cheerio.CheerioAPI,
  root: CheerioRoot,
): string[] {
  const values: string[] = [];
  root
    .find('[itemprop="recipeCategory"], [itemprop="keywords"]')
    .each((_, el) => {
      const text = elementText($, $(el));
      if (!text) return;
      for (const part of text.split(/[,;|/]/)) {
        const trimmed = part.trim();
        if (trimmed) values.push(trimmed);
      }
    });
  return [...new Set(values)];
}

function ingredientsFromRoot(
  $: cheerio.CheerioAPI,
  root: CheerioRoot,
): string[] {
  const lines: string[] = [];
  root.find('[itemprop="recipeIngredient"]').each((_, el) => {
    const node = $(el);
    const name = collapseWhitespace(
      node.find('.ingredient-name, [itemprop="name"]').first().text() || '',
    );
    const qty = collapseWhitespace(
      node.find('.ingredient-qty, [itemprop="amount"]').first().text() || '',
    );
    if (name || qty) {
      lines.push(collapseWhitespace(`${name} ${qty}`.trim()));
      return;
    }
    const text = elementText($, node);
    if (text) lines.push(text);
  });
  return lines;
}

function stepsFromRoot(
  $: cheerio.CheerioAPI,
  root: CheerioRoot,
): ExtractedRecipeStep[] {
  const steps: ExtractedRecipeStep[] = [];
  let sortOrder = 0;

  const instructionNodes = root.find(
    '[itemprop="recipeInstructions"][itemtype*="HowToStep"], [itemprop="recipeInstructions"].step, .step[itemprop="recipeInstructions"]',
  );

  if (instructionNodes.length > 0) {
    instructionNodes.each((_, el) => {
      const step = $(el);
      const name =
        elementText($, step.find('[itemprop="name"]').first()) ??
        collapseWhitespace(step.find('.step-name').first().text());
      const textEl = step.find('[itemprop="text"], .step-text').first();
      let instruction = '';
      let tip: string | null = null;

      if (textEl.length) {
        const tipNodes = textEl.find('.recipe-tip, .tip, .wskazowka');
        if (tipNodes.length) {
          tip = collapseWhitespace(
            tipNodes
              .map((__, tipEl) => $(tipEl).text())
              .get()
              .join(' '),
          ).replace(/^(Porada(?:\s*\d+)?|Tip|Wskazówka)\s*:\s*/i, '');
          tipNodes.remove();
        }
        instruction = collapseWhitespace(textEl.text());
      } else {
        const split = splitTipFromInstruction(elementText($, step) ?? '');
        instruction = split.instruction;
        tip = split.tip;
      }

      if (!instruction && name) {
        instruction = name;
      }
      if (!instruction) return;

      const title = name
        ? name.replace(/^Krok\s+\d+\s*:\s*/i, '').trim() || name
        : null;

      steps.push({
        title,
        instruction,
        tip: tip || null,
        sortOrder: sortOrder++,
      });
    });
    return steps;
  }

  root.find('[itemprop="recipeInstructions"]').each((_, el) => {
    const node = $(el);
    // Kontener obejmujący składniki / cały artykuł — nie traktuj jako instrukcji.
    if (node.find('[itemprop="recipeIngredient"]').length > 0) {
      return;
    }
    if (
      node.find(
        '[itemprop="recipeInstructions"][itemtype*="HowToStep"], [itemtype*="HowToStep"]',
      ).length > 0
    ) {
      return;
    }

    const paragraphs: string[] = [];
    const pNodes = node.find('p');
    if (pNodes.length > 0) {
      pNodes.each((__, p) => {
        const text = collapseWhitespace($(p).text());
        if (text) paragraphs.push(text);
      });
    } else {
      const text = elementText($, node);
      if (text) paragraphs.push(text);
    }
    if (paragraphs.length === 0) return;

    const instruction = paragraphs.join('\n\n');
    steps.push({
      title: null,
      instruction,
      tip: null,
      sortOrder: sortOrder++,
    });
  });

  return steps;
}

function mapRecipeRoot(
  $: cheerio.CheerioAPI,
  root: CheerioRoot,
): ExtractedRecipeCandidate {
  const warnings: string[] = [];
  const name =
    propValue($, root, 'name') ??
    collapseWhitespace(root.find('h1').first().text()) ??
    '';

  const description = propValue($, root, 'description');
  const servingsParsed = parseServings(propValue($, root, 'recipeYield'));
  if (servingsParsed.raw && servingsParsed.value === null) {
    warnings.push(
      `Liczba porcji jest niejednoznaczna („${servingsParsed.raw}”) — ustal ją przed zapisem.`,
    );
  }

  const prepTimeMinutes = parseIsoDurationMinutes(
    propValue($, root, 'prepTime'),
  );
  const cookTimeMinutes = parseIsoDurationMinutes(
    propValue($, root, 'cookTime') ?? propValue($, root, 'totalTime'),
  );

  const steps = stepsFromRoot($, root);
  if (
    steps.length === 1 &&
    (steps[0]?.instruction.includes('\n\n') ||
      (steps[0]?.instruction.length ?? 0) > 280)
  ) {
    warnings.push(
      'Źródło nie wydziela osobnych kroków przygotowania — treść zapisano jako jeden edytowalny krok (akapity zachowane).',
    );
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
    sourceAuthor: authorFromRoot($, root),
    sourceCategories: categoriesFromRoot($, root),
    ingredientLines: ingredientsFromRoot($, root),
    steps,
    warnings,
    gaps: [],
  };
}

export function extractRecipesFromMicrodata(
  html: string,
): ExtractedRecipeCandidate[] {
  const $ = cheerio.load(html);
  const candidates: ExtractedRecipeCandidate[] = [];

  $('[itemscope]').each((_, el) => {
    const type = $(el).attr('itemtype') ?? $(el).attr('itemType');
    if (!typeIncludesRecipe(type)) return;
    if (
      $(el)
        .parents('[itemscope]')
        .filter((__, parent) => {
          return typeIncludesRecipe(
            $(parent).attr('itemtype') ?? $(parent).attr('itemType'),
          );
        }).length > 0
    ) {
      return;
    }
    candidates.push(finalizeCandidateGaps(mapRecipeRoot($, $(el))));
  });

  return candidates;
}

export function extractRecipesFromRdfa(
  html: string,
): ExtractedRecipeCandidate[] {
  const $ = cheerio.load(html);
  const candidates: ExtractedRecipeCandidate[] = [];

  $('[typeof]').each((_, el) => {
    const type = $(el).attr('typeof') ?? '';
    if (!typeIncludesRecipe(type.replace(/\s+/g, ' '))) return;
    const root = $(el);
    const name =
      collapseWhitespace(
        root.find('[property="schema:name"], [property="name"]').first().text(),
      ) || collapseWhitespace(root.find('h1').first().text());
    const ingredientLines: string[] = [];
    root
      .find(
        '[property="schema:recipeIngredient"], [property="recipeIngredient"]',
      )
      .each((__, ing) => {
        const text = collapseWhitespace($(ing).text());
        if (text) ingredientLines.push(text);
      });
    const steps: ExtractedRecipeStep[] = [];
    let stepIndex = 0;
    root
      .find(
        '[property="schema:recipeInstructions"], [property="recipeInstructions"]',
      )
      .each((__, stepEl) => {
        const text = collapseWhitespace($(stepEl).text());
        if (!text) return;
        steps.push({
          title: null,
          instruction: text,
          tip: null,
          sortOrder: stepIndex++,
        });
      });

    candidates.push(
      finalizeCandidateGaps({
        name: name || 'Zaimportowany przepis',
        description:
          collapseWhitespace(
            root
              .find('[property="schema:description"], [property="description"]')
              .first()
              .text(),
          ) || null,
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
      }),
    );
  });

  return candidates;
}
