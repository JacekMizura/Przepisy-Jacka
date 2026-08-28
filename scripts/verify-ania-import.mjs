/**
 * Lokalna weryfikacja rzeczywistego importu Ani Gotuje (bez zapisu do DB).
 * Używa tego samego pipeline'u co API.
 */
import { extractRecipesFromFetchedHtml } from '../apps/api/dist/recipes/import/extract-pipeline.js';
import { safeFetchHttps } from '../apps/api/dist/recipes/import/safe-http-fetch.js';

const URLS = [
  'https://aniagotuje.pl/przepis/sos-slodko-kwasny-do-sloikow',
  'https://aniagotuje.pl/przepis/pomidory-w-sloikach',
  'https://aniagotuje.pl/przepis/ketchup-z-cukinii',
];

async function runOne(url) {
  console.log('\n===', url);
  const fetched = await safeFetchHttps(url, {
    timeoutMs: 20_000,
    maxBytes: 2_000_000,
    maxRedirects: 3,
    userAgent:
      'MojaKuchniaRecipeImport/1.0 (+https://github.com/JacekMizura/Przepisy-Jacka)',
  });
  console.log('finalUrl:', fetched.finalUrl, 'bytes:', fetched.body.length);
  const result = extractRecipesFromFetchedHtml(fetched.body, fetched.finalUrl);
  console.log('method:', result.method);
  console.log('candidates:', result.candidates.length);
  const c = result.candidates[0];
  if (!c) {
    console.log('message:', result.message);
    return false;
  }
  console.log('name:', c.name);
  console.log('author:', c.sourceAuthor);
  console.log('servingsRaw:', c.servingsRaw, 'ambiguous:', c.servingsAmbiguous);
  console.log('prep/cook min:', c.prepTimeMinutes, c.cookTimeMinutes);
  console.log('ingredients:', c.ingredientLines.length);
  console.log('steps:', c.steps.length);
  if (c.steps.length === 1 && c.steps[0]?.instruction.includes('\n\n')) {
    console.log(
      'prose step paragraphs:',
      c.steps[0].instruction.split(/\n\n/).length,
    );
  }
  console.log(
    'tips:',
    c.steps.filter((s) => s.tip).map((s) => `${s.title ?? '?'}: ${s.tip?.slice(0, 80)}`),
  );
  console.log('gaps:', c.gaps);
  console.log('warnings sample:', c.warnings.slice(0, 3));
  return Boolean(c.name && c.ingredientLines.length && c.steps.length);
}

const results = [];
for (const url of URLS) {
  results.push(await runOne(url));
}
if (results.some((ok) => !ok)) {
  process.exit(1);
}
console.log('\nOK — przepisy Ani Gotuje odczytane.');
