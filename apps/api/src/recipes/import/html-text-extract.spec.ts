import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { extractRecipesFromFetchedHtml } from './extract-pipeline';
import { extractRecipesFromGenericHtml } from './generic-html';
import { extractRecipesFromMicrodata } from './microdata-rdfa';
import { extractRecipeFromPastedText } from './pasted-text';
import { extractAniaGotujeRecipes } from './site-aniagotuje';

function fixture(name: string): string {
  return readFileSync(
    join(process.cwd(), 'test/fixtures/recipe-import', name),
    'utf8',
  );
}

describe('HTML / text recipe extraction', () => {
  it('parses Ania Gotuje fixture with tips and ambiguous jars', () => {
    const html = fixture('ania-sos.html');
    const recipes = extractAniaGotujeRecipes(html);
    expect(recipes).toHaveLength(1);
    expect(recipes[0]?.name).toBe('Sos testowy do słoików');
    expect(recipes[0]?.sourceAuthor).toBe('Ania Gotuje');
    expect(recipes[0]?.servings).toBeNull();
    expect(recipes[0]?.servingsRaw).toContain('2 słoiki');
    expect(recipes[0]?.servingsAmbiguous).toBe(true);
    expect(recipes[0]?.ingredientLines).toHaveLength(3);
    expect(recipes[0]?.steps).toHaveLength(3);
    expect(recipes[0]?.steps[1]?.tip).toMatch(/passaty/i);
    expect(
      recipes[0]?.steps.every((s) => !/FAQ|Komentarz/i.test(s.instruction)),
    ).toBe(true);
  });

  it('pipeline prefers Ania site parser for aniagotuje final URL', () => {
    const result = extractRecipesFromFetchedHtml(
      fixture('ania-sos.html'),
      'https://aniagotuje.pl/przepis/ania-sos',
    );
    expect(result.method).toBe('site:aniagotuje');
    expect(result.candidates[0]?.steps[1]?.tip).toBeTruthy();
  });

  it('parses microdata Recipe', () => {
    const recipes = extractRecipesFromMicrodata(fixture('microdata.html'));
    expect(recipes[0]?.name).toBe('Zupa microdata');
    expect(recipes[0]?.ingredientLines).toHaveLength(2);
    expect(recipes[0]?.servings).toBe(4);
  });

  it('parses generic HTML sections and skips comments', () => {
    const recipes = extractRecipesFromGenericHtml(fixture('generic-html.html'));
    expect(recipes[0]?.name).toBe('Sałatka ogólna HTML');
    expect(recipes[0]?.ingredientLines[0]).toMatch(/ogórka/i);
    expect(recipes[0]?.steps).toHaveLength(2);
    expect(recipes[0]?.steps[1]?.tip).toMatch(/od razu/i);
  });

  it('does not treat title-only page as recipe', () => {
    const html =
      '<html><head><meta property="og:description" content="Tylko opis"></head><body><h1>Tytuł</h1></body></html>';
    const result = extractRecipesFromFetchedHtml(html, 'https://example.com/x');
    expect(result.candidates).toHaveLength(0);
  });

  it('parses pasted text with leftover fragments', () => {
    const text = `Omlet domowy

Składniki
2 jajka
sól do smaku

Przygotowanie
Krok 1: Ubij
Ubij jajka.
Porada: Nie ubijaj za długo.

Krok 2: Smaż
Smaż na patelni.

Hashtag #obiad i luźna notatka na koniec.
`;
    const recipe = extractRecipeFromPastedText(text);
    expect(recipe.name).toBe('Omlet domowy');
    expect(recipe.ingredientLines).toContain('2 jajka');
    expect(recipe.steps[0]?.tip).toMatch(/za długo/i);
    expect(recipe.unassignedFragments?.some((f) => /Hashtag/i.test(f))).toBe(
      true,
    );
  });

  it('suggests paste caption for social hosts without recipe', () => {
    const result = extractRecipesFromFetchedHtml(
      '<html><body><h1>Reel</h1><p>#food</p></body></html>',
      'https://www.instagram.com/p/abc/',
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.suggestPasteCaption).toBe(true);
  });

  it('does not treat script tags as recipe content and strips XSS markup', () => {
    const html = `<html><body>
      <h1>XSS test</h1>
      <h2>Składniki</h2>
      <ul><li>mąka <script>alert(1)</script> 200 g</li></ul>
      <h2>Przygotowanie</h2>
      <ol><li>Wymieszaj<img src=x onerror=alert(2)> ciasto</li><li>Piecz</li></ol>
    </body></html>`;
    const recipes = extractRecipesFromGenericHtml(html);
    expect(recipes).toHaveLength(1);
    const blob = JSON.stringify(recipes[0]);
    expect(blob).not.toMatch(/<script/i);
    expect(blob).not.toMatch(/onerror=/i);
    expect(recipes[0]?.ingredientLines[0]).toMatch(/mąka/i);
  });

  it('returns gaps for incomplete recipe with only ingredients', () => {
    const html = `<html><body>
      <article>
        <h1>Tylko składniki</h1>
        <h2>Składniki</h2>
        <ul><li>1 jajko</li><li>sól</li></ul>
      </article>
    </body></html>`;
    const recipes = extractRecipesFromGenericHtml(html);
    expect(recipes[0]?.gaps.some((g) => /instrukcji/i.test(g))).toBe(true);
    expect(recipes[0]?.ingredientLines.length).toBeGreaterThan(0);
  });

  it('parses second Ania Gotuje fixture (placek)', () => {
    const recipes = extractAniaGotujeRecipes(fixture('ania-placek.html'));
    expect(recipes[0]?.name).toMatch(/placek/i);
    expect(recipes[0]?.steps.length).toBeGreaterThanOrEqual(2);
    expect(recipes[0]?.ingredientLines.length).toBeGreaterThanOrEqual(2);
  });

  it('parses Ania prose preparation without HowToStep as one editable step', () => {
    const result = extractRecipesFromFetchedHtml(
      fixture('ania-ketchup-prose.html'),
      'https://aniagotuje.pl/przepis/ania-ketchup-prose',
    );
    expect(result.method).toBe('site:aniagotuje');
    const recipe = result.candidates[0];
    expect(recipe?.steps).toHaveLength(1);
    expect(recipe?.steps[0]?.instruction).toMatch(/Jabłka oraz cukinie/i);
    expect(recipe?.steps[0]?.instruction).toMatch(/\n\n/);
    expect(recipe?.steps[0]?.instruction).not.toMatch(/Zapraszam po pyszny/i);
    expect(recipe?.steps[0]?.instruction).not.toMatch(/podobne przepisy/i);
    expect(recipe?.steps[0]?.instruction).not.toMatch(/Komentarz/i);
    expect(recipe?.steps[0]?.instruction).not.toMatch(/Szklanka ma u mnie/i);
    expect(recipe?.steps[0]?.tip).toMatch(/lodówki/i);
    expect(recipe?.warnings.some((w) => /jeden edytowalny krok/i.test(w))).toBe(
      true,
    );
  });

  it('does not treat microdata recipeInstructions wrapping ingredients as steps', () => {
    const recipes = extractRecipesFromMicrodata(
      fixture('ania-ketchup-prose.html'),
    );
    expect(recipes[0]?.steps).toHaveLength(0);
    expect(recipes[0]?.ingredientLines.length).toBeGreaterThan(0);
  });

  it('keeps clean textual recipeInstructions as one step with paragraphs', () => {
    const html = `<html><body>
      <div itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Zupa tekstowa</h1>
        <span itemprop="recipeIngredient">1 marchew</span>
        <div itemprop="recipeInstructions">
          <p>Obierz warzywa.</p>
          <p>Gotuj 20 minut.</p>
        </div>
      </div>
    </body></html>`;
    const recipes = extractRecipesFromMicrodata(html);
    expect(recipes[0]?.steps).toHaveLength(1);
    expect(recipes[0]?.steps[0]?.instruction).toBe(
      'Obierz warzywa.\n\nGotuj 20 minut.',
    );
    expect(
      recipes[0]?.warnings.some((w) => /jeden edytowalny krok/i.test(w)),
    ).toBe(true);
  });
});
