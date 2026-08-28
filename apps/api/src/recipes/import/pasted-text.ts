import type { ExtractedRecipeCandidate, ExtractedRecipeStep } from './types';
import {
  collapseWhitespace,
  finalizeCandidateGaps,
  splitTipFromInstruction,
} from './shared-parse';

const INGREDIENT_HEADING =
  /^(składniki|skladniki|ingredients|co potrzeba|potrzebujesz)\b/i;
const STEPS_HEADING =
  /^(przygotowanie|instrukcje|sposób przygotowania|wykonanie|kroki|instructions|method|directions)\b/i;
const TIP_LINE = /^(porada(?:\s*\d+)?|tip|wskazówka)\s*:\s*(.+)$/i;

/**
 * Import z wklejonego tekstu — rozpoznaje jednoznaczne sekcje, resztę zostawia.
 */
export function extractRecipeFromPastedText(
  rawText: string,
): ExtractedRecipeCandidate {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''));

  let name = '';
  let description: string | null = null;
  const ingredientLines: string[] = [];
  const steps: ExtractedRecipeStep[] = [];
  const unassigned: string[] = [];
  const warnings: string[] = [];

  type Mode = 'start' | 'ingredients' | 'steps' | 'other';
  let mode: Mode = 'start';
  let pendingStepTitle: string | null = null;
  let pendingInstruction: string[] = [];
  let pendingTip: string | null = null;

  const flushStep = () => {
    if (pendingInstruction.length === 0 && !pendingStepTitle) {
      pendingTip = null;
      return;
    }
    const instruction = pendingInstruction.join('\n\n').trim();
    if (!instruction && pendingStepTitle) {
      unassigned.push(pendingStepTitle);
    } else if (instruction) {
      steps.push({
        title: pendingStepTitle,
        instruction,
        tip: pendingTip,
        sortOrder: steps.length,
      });
    }
    pendingStepTitle = null;
    pendingInstruction = [];
    pendingTip = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (mode === 'start' && !name) {
      name = collapseWhitespace(line);
      continue;
    }

    if (INGREDIENT_HEADING.test(line)) {
      flushStep();
      mode = 'ingredients';
      continue;
    }
    if (STEPS_HEADING.test(line)) {
      flushStep();
      mode = 'steps';
      continue;
    }

    const tipMatch = line.match(TIP_LINE);
    if (tipMatch && mode === 'steps') {
      pendingTip = collapseWhitespace(tipMatch[2] ?? '');
      continue;
    }

    const stepTitle = line.match(/^Krok\s+\d+\s*[:.\-–—]?\s*(.*)$/i);
    if (stepTitle) {
      flushStep();
      mode = 'steps';
      pendingStepTitle = collapseWhitespace(stepTitle[1] || line) || null;
      continue;
    }

    if (mode === 'ingredients') {
      if (/^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
        ingredientLines.push(
          line.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, ''),
        );
      } else if (line.length < 120) {
        ingredientLines.push(line);
      } else {
        unassigned.push(line);
        warnings.push(
          'Długi fragment w sekcji składników pozostawiono do ręcznego opracowania.',
        );
      }
      continue;
    }

    if (mode === 'steps') {
      if (/^#\w/.test(line) || /^hashtag\b/i.test(line)) {
        flushStep();
        mode = 'other';
        unassigned.push(line);
        continue;
      }
      if (/^\d+[.)]\s+/.test(line)) {
        flushStep();
        const split = splitTipFromInstruction(line.replace(/^\d+[.)]\s+/, ''));
        pendingInstruction = [split.instruction];
        pendingTip = split.tip;
      } else {
        pendingInstruction.push(line);
      }
      continue;
    }

    if (mode === 'other') {
      unassigned.push(line);
      continue;
    }

    if (mode === 'start' && !description && line.length > 40) {
      description = line;
      continue;
    }

    unassigned.push(line);
  }

  flushStep();

  if (!name) {
    name = 'Zaimportowany przepis';
    warnings.push('Nie wykryto tytułu — uzupełnij nazwę.');
  }

  return finalizeCandidateGaps({
    name,
    description,
    servings: null,
    servingsRaw: null,
    servingsAmbiguous: false,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    sourceAuthor: null,
    sourceCategories: [],
    ingredientLines,
    steps,
    warnings,
    gaps: [],
    unassignedFragments: unassigned,
  });
}
