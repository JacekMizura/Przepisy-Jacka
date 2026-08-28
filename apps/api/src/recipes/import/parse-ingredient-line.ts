import { RecipeIngredientUnit } from '../../generated/prisma/client';

export type ParsedIngredientLine = {
  rawText: string;
  name: string;
  quantity: string | null;
  unit: RecipeIngredientUnit | null;
  confidence: 'exact' | 'ambiguous' | 'none';
  warnings: string[];
};

const UNIT_PATTERNS: Array<{
  unit: RecipeIngredientUnit;
  pattern: RegExp;
}> = [
  {
    unit: RecipeIngredientUnit.kilogram,
    pattern: /^(kg|kilogramy|kilograma|kilogram)\b/i,
  },
  {
    unit: RecipeIngredientUnit.gram,
    pattern: /^(g|gramy|grama|gramów|gram)\b/i,
  },
  {
    unit: RecipeIngredientUnit.liter,
    pattern: /^(l|ltr|litry|litra|litrów|litr)\b/i,
  },
  {
    unit: RecipeIngredientUnit.milliliter,
    pattern: /^(ml|mililitry|mililitra|mililitrów|mililitr)\b/i,
  },
  {
    unit: RecipeIngredientUnit.tablespoon,
    pattern: /^(łyżki|łyżka|łyżek|tbsp|tbs|el\.?)\b/i,
  },
  {
    unit: RecipeIngredientUnit.teaspoon,
    pattern: /^(łyżeczki|łyżeczka|łyżeczek|tsp|ts|cl\.?)\b/i,
  },
  {
    unit: RecipeIngredientUnit.cup,
    pattern: /^(szklanki|szklanka|szklanek|cup|cups)\b/i,
  },
  {
    unit: RecipeIngredientUnit.pinch,
    pattern: /^(szczypty|szczypta|szczyptę|pinch)\b/i,
  },
  {
    unit: RecipeIngredientUnit.package,
    pattern: /^(opakowania|opakowanie|opakowań|op\.?|package|pack)\b/i,
  },
  {
    unit: RecipeIngredientUnit.piece,
    pattern: /^(sztuki|sztuka|sztuk|szt\.?|pcs?|pieces?)\b/i,
  },
];

const TO_TASTE_RE =
  /\b(do\s+smaku|według\s+uznania|opcjonalnie|to\s+taste|as\s+needed)\b/i;

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

/**
 * Rozpoznaje jednoznaczne ilości/jednostki. Nie zgaduje „1 szt.”.
 */
export function parseIngredientLine(rawInput: string): ParsedIngredientLine {
  const rawText = rawInput.trim().replace(/\s+/g, ' ');
  const warnings: string[] = [];

  if (!rawText) {
    return {
      rawText,
      name: '',
      quantity: null,
      unit: null,
      confidence: 'none',
      warnings: ['Pusty składnik.'],
    };
  }

  if (TO_TASTE_RE.test(rawText)) {
    const name = rawText
      .replace(TO_TASTE_RE, '')
      .replace(/^[,\-–—:\s]+|[,\-–—:\s]+$/g, '')
      .trim();
    return {
      rawText,
      name: name || rawText,
      quantity: null,
      unit: RecipeIngredientUnit.to_taste,
      confidence: 'exact',
      warnings,
    };
  }

  const quantityMatch = rawText.match(
    /^((?:\d+[.,]\d+|\d+\s+\d+\/\d+|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+))\s*(.*)$/u,
  );

  if (!quantityMatch) {
    for (const entry of UNIT_PATTERNS) {
      const match = rawText.match(entry.pattern);
      if (match) {
        const name = rawText
          .slice(match[0].length)
          .trim()
          .replace(/^[\s,.\-–—:]+/, '');
        return {
          rawText,
          name: name || rawText,
          quantity: null,
          unit: entry.unit,
          confidence: 'exact',
          warnings,
        };
      }
    }
    warnings.push('Nie rozpoznano ilości — pozostawiono tekst składnika.');
    return {
      rawText,
      name: rawText,
      quantity: null,
      unit: null,
      confidence: 'none',
      warnings,
    };
  }

  const quantityToken = quantityMatch[1] ?? '';
  const rest = (quantityMatch[2] ?? '').trim();
  const quantityValue = parseQuantityToken(quantityToken);

  if (quantityValue === null) {
    warnings.push('Nie udało się zinterpretować ilości.');
    return {
      rawText,
      name: rawText,
      quantity: null,
      unit: null,
      confidence: 'ambiguous',
      warnings,
    };
  }

  let unit: RecipeIngredientUnit | null = null;
  let nameRest = rest;
  for (const entry of UNIT_PATTERNS) {
    const match = rest.match(entry.pattern);
    if (match) {
      unit = entry.unit;
      nameRest = rest
        .slice(match[0].length)
        .trim()
        .replace(/^[\s,.\-–—:]+/, '');
      break;
    }
  }

  if (!unit) {
    warnings.push(
      'Rozpoznano ilość, ale nie jednoznaczną jednostkę — uzupełnij przed zapisem.',
    );
    return {
      rawText,
      name: nameRest || rawText,
      quantity: formatDecimal(quantityValue),
      unit: null,
      confidence: 'ambiguous',
      warnings,
    };
  }

  return {
    rawText,
    name: nameRest || rawText,
    quantity: formatDecimal(quantityValue),
    unit,
    confidence: 'exact',
    warnings,
  };
}

function parseQuantityToken(token: string): number | null {
  const trimmed = token.trim();
  if (UNICODE_FRACTIONS[trimmed] !== undefined) {
    return UNICODE_FRACTIONS[trimmed];
  }

  const mixed = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (!den) return null;
    return whole + num / den;
  }

  const fraction = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (!den) return null;
    return num / den;
  }

  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function formatDecimal(value: number): string {
  return value.toFixed(3);
}
