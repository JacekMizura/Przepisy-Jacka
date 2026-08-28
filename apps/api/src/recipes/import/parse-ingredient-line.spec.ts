import { RecipeIngredientUnit } from '../../generated/prisma/client';
import { parseIngredientLine } from './parse-ingredient-line';

describe('parseIngredientLine', () => {
  it('parses decimal comma and unit', () => {
    const parsed = parseIngredientLine('1,5 łyżki oliwy');
    expect(parsed.confidence).toBe('exact');
    expect(parsed.quantity).toBe('1.500');
    expect(parsed.unit).toBe(RecipeIngredientUnit.tablespoon);
    expect(parsed.name.toLowerCase()).toContain('oliw');
  });

  it('parses simple fractions', () => {
    const parsed = parseIngredientLine('1/2 szklanki mleka');
    expect(parsed.quantity).toBe('0.500');
    expect(parsed.unit).toBe(RecipeIngredientUnit.cup);
  });

  it('keeps to-taste without inventing quantity', () => {
    const parsed = parseIngredientLine('sól do smaku');
    expect(parsed.quantity).toBeNull();
    expect(parsed.unit).toBe(RecipeIngredientUnit.to_taste);
    expect(parsed.confidence).toBe('exact');
  });

  it('does not invent piece unit for bare amounts', () => {
    const parsed = parseIngredientLine('2 jabłka');
    expect(parsed.quantity).toBe('2.000');
    expect(parsed.unit).toBeNull();
    expect(parsed.confidence).toBe('ambiguous');
  });

  it('parses English tablespoon and teaspoon plurals', () => {
    const tbsp = parseIngredientLine('2 tablespoons olive oil');
    expect(tbsp.quantity).toBe('2.000');
    expect(tbsp.unit).toBe(RecipeIngredientUnit.tablespoon);

    const tsp = parseIngredientLine('2 teaspoons salt');
    expect(tsp.quantity).toBe('2.000');
    expect(tsp.unit).toBe(RecipeIngredientUnit.teaspoon);
  });

  it('parses unit-leading lines without inventing quantity', () => {
    const parsed = parseIngredientLine('szczypta pieprzu');
    expect(parsed.quantity).toBeNull();
    expect(parsed.unit).toBe(RecipeIngredientUnit.pinch);
    expect(parsed.name.toLowerCase()).toContain('pieprz');
  });

  it('preserves raw text always', () => {
    const raw = '  100 g mąki  ';
    const parsed = parseIngredientLine(raw);
    expect(parsed.rawText).toBe('100 g mąki');
  });
});
