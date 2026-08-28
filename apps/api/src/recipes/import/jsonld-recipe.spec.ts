import { extractRecipesFromHtml } from './jsonld-recipe';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('extractRecipesFromHtml', () => {
  it('reads a single Recipe with sections and tips', () => {
    const html = readFileSync(
      join(process.cwd(), 'test/fixtures/recipe-import/basic.html'),
      'utf8',
    );
    const recipes = extractRecipesFromHtml(html);
    expect(recipes).toHaveLength(1);
    expect(recipes[0]?.name).toBe('Omlet klasyczny');
    expect(recipes[0]?.servings).toBe(2);
    expect(recipes[0]?.sourceAuthor).toBe('Anna Kucharka');
    expect(recipes[0]?.ingredientLines.length).toBe(4);
    expect(recipes[0]?.steps[0]?.title).toBe('Przygotowanie · Ubijanie');
    expect(recipes[0]?.steps[0]?.tip).toBe('Nie ubijaj zbyt długo.');
  });

  it('supports @graph and multi-type Recipe; keeps ambiguous yield', () => {
    const html = readFileSync(
      join(process.cwd(), 'test/fixtures/recipe-import/multi.html'),
      'utf8',
    );
    const recipes = extractRecipesFromHtml(html);
    expect(recipes).toHaveLength(2);
    expect(recipes.map((item) => item.name).sort()).toEqual([
      'Sałatka grecka',
      'Zupa pomidorowa',
    ]);
    const salad = recipes.find((item) => item.name === 'Sałatka grecka');
    expect(salad?.servings).toBeNull();
    expect(salad?.servingsRaw).toBe('2 słoiki');
    expect(salad?.servingsAmbiguous).toBe(true);
  });

  it('returns empty list when no Recipe JSON-LD', () => {
    const html = readFileSync(
      join(process.cwd(), 'test/fixtures/recipe-import/empty.html'),
      'utf8',
    );
    expect(extractRecipesFromHtml(html)).toEqual([]);
  });

  it('decodes HTML entities in Recipe text fields', () => {
    const html = `<script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "World&#39;s Best Lasagna",
        "description": "Pasta &amp; cheese",
        "recipeIngredient": ["1 cup cheese"],
        "recipeInstructions": "Bake &amp; serve."
      }
    </script>`;
    const recipes = extractRecipesFromHtml(html);
    expect(recipes).toHaveLength(1);
    expect(recipes[0]?.name).toBe("World's Best Lasagna");
    expect(recipes[0]?.description).toBe('Pasta & cheese');
    expect(recipes[0]?.steps[0]?.instruction).toBe('Bake & serve.');
  });
});
