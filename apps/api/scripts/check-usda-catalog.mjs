/**
 * Kontrola integralności katalogu USDA (v1 demonstracyjny + v2).
 *
 *   pnpm --filter @moja-kuchnia/api usda:check-catalog
 *   node scripts/check-usda-catalog.mjs v2
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionArg = process.argv[2] === 'v1' ? 'v1' : 'v2';
const CATALOG_DIR = join(__dirname, '../data/usda-catalog', versionArg);
const EXPECTED_MIN = versionArg === 'v1' ? 91 : 200;
const EXPECTED_EXACT = versionArg === 'v1' ? 91 : null;
const FORMAT_VERSION =
  versionArg === 'v1' ? 'usda-catalog-v1' : 'usda-catalog-v2';
const ENERGY_FIELDS = new Set([
  '2048_atwater_specific',
  '2047_atwater_general',
  '1008_energy_kcal',
  '1009_energy_kj_converted',
]);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const entriesRaw = readFileSync(join(CATALOG_DIR, 'entries.json'));
const manifestRaw = readFileSync(join(CATALOG_DIR, 'manifest.json'));
const catalog = JSON.parse(entriesRaw.toString('utf8'));
const manifest = JSON.parse(manifestRaw.toString('utf8'));

const entriesSha256 = createHash('sha256').update(entriesRaw).digest('hex');
const entriesArraySha256 = createHash('sha256')
  .update(JSON.stringify(catalog.entries))
  .digest('hex');

assert(
  manifest.formatVersion === FORMAT_VERSION ||
    (versionArg === 'v2' && !manifest.formatVersion),
  `formatVersion=${manifest.formatVersion}`,
);
assert(
  manifest.catalogVersion === catalog.catalogVersion,
  'catalogVersion mismatch vs entries.json',
);
if (EXPECTED_EXACT != null) {
  assert(catalog.entryCount === EXPECTED_EXACT, `entryCount=${catalog.entryCount}`);
  assert(
    catalog.entries.length === EXPECTED_EXACT,
    `entries.length=${catalog.entries.length}`,
  );
  assert(
    manifest.entryCount === EXPECTED_EXACT,
    `manifest.entryCount=${manifest.entryCount}`,
  );
} else {
  assert(
    catalog.entries.length >= EXPECTED_MIN,
    `entries.length=${catalog.entries.length} < ${EXPECTED_MIN}`,
  );
  assert(
    catalog.entryCount === catalog.entries.length,
    'entryCount vs entries.length',
  );
  assert(
    manifest.entryCount === catalog.entries.length,
    'manifest.entryCount mismatch',
  );
}
assert(
  manifest.entriesSha256 === entriesSha256,
  `entriesSha256 mismatch (manifest=${manifest.entriesSha256} actual=${entriesSha256})`,
);
assert(
  !manifest.entriesArraySha256 ||
    manifest.entriesArraySha256 === entriesArraySha256,
  'entriesArraySha256 mismatch',
);

assert(Array.isArray(manifest.sources) && manifest.sources.length === 2, 'sources');
const [foundation, srLegacy] = manifest.sources;
assert(
  foundation.dataType === 'Foundation Foods' || foundation.dataType?.includes('Foundation'),
  'Foundation dataType',
);
assert(
  String(foundation.release).includes('2025-12-18') ||
    foundation.releaseDate === '2025-12-18',
  'Foundation release',
);
assert(
  String(srLegacy.release).includes('2018-04') ||
    srLegacy.releaseDate === '2018-04',
  'SR Legacy release',
);

const fdcIds = new Set();
for (const entry of catalog.entries) {
  assert(Number.isInteger(entry.fdcId), `fdcId ${entry.fdcId}`);
  assert(!fdcIds.has(entry.fdcId), `duplikat fdcId ${entry.fdcId}`);
  fdcIds.add(entry.fdcId);
  assert(
    typeof entry.polishName === 'string' && entry.polishName.length > 1,
    `polishName ${entry.fdcId}`,
  );
  assert(
    typeof entry.descriptionOriginal === 'string' &&
      entry.descriptionOriginal.length > 1,
    `descriptionOriginal ${entry.fdcId}`,
  );
  assert(Array.isArray(entry.aliases), `aliases ${entry.fdcId}`);
  assert(entry.nutrition && typeof entry.nutrition === 'object', `nutrition ${entry.fdcId}`);
  assert(
    entry.nutrition.kcal != null && Number(entry.nutrition.kcal) >= 0,
    `kcal ${entry.fdcId}`,
  );
  assert(
    ENERGY_FIELDS.has(entry.nutrition.energyField) ||
      typeof entry.nutrition.energyField === 'string',
    `energyField ${entry.fdcId}`,
  );
}

if (versionArg === 'v2') {
  const names = catalog.entries.map((e) =>
    `${e.polishName} ${(e.aliases || []).join(' ')}`.toLowerCase(),
  );
  for (const needle of [
    'papryka',
    'pomidor',
    'ziemniak',
    'cebula',
    'czosnek',
    'marchew',
    'ogórek',
    'cukinia',
    'brokuł',
    'kalafior',
    'pieczarki',
    'jabłko',
    'banan',
    'truskawk',
    'pierś',
    'wołowin',
    'wieprzowin',
    'łosoś',
    'dorsz',
    'tuńczyk',
    'jajk',
    'mleko',
    'mozzarella',
    'ser żółty',
    'szynka',
    'ryż',
    'makaron',
    'kasza',
    'płatki owsiane',
  ]) {
    const folded = needle
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/ł/g, 'l');
    const hit = names.some((n) => {
      const f = n
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/ł/g, 'l');
      return f.includes(folded);
    });
    assert(hit, `brak pokrycia kontrolnego: ${needle}`);
  }
}

if (process.exitCode) {
  console.error(`Catalog ${versionArg} check FAILED`);
} else {
  console.log(
    `OK catalog ${versionArg}: entries=${catalog.entries.length} sha256=${entriesSha256.slice(0, 12)}…`,
  );
}
