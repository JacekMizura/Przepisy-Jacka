/**
 * Kontrola integralności katalogu USDA v1 (bez sieci, bez bazy).
 *
 *   pnpm --filter @moja-kuchnia/api usda:check-catalog
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = join(__dirname, '../data/usda-catalog/v1');
const EXPECTED_COUNT = 91;
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
  manifest.formatVersion === 'usda-catalog-v1',
  `formatVersion=${manifest.formatVersion}`,
);
assert(
  manifest.catalogVersion === catalog.catalogVersion,
  'catalogVersion mismatch vs entries.json',
);
assert(catalog.entryCount === EXPECTED_COUNT, `entryCount=${catalog.entryCount}`);
assert(
  catalog.entries.length === EXPECTED_COUNT,
  `entries.length=${catalog.entries.length}`,
);
assert(
  manifest.entryCount === EXPECTED_COUNT,
  `manifest.entryCount=${manifest.entryCount}`,
);
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
assert(foundation.dataType === 'Foundation Foods', 'Foundation dataType');
assert(foundation.release === '2025-12-18', 'Foundation release');
assert(foundation.releaseDate === '2025-12-18', 'Foundation releaseDate');
assert(
  typeof foundation.archiveUrl === 'string' &&
    foundation.archiveUrl.includes('foundation_food_json_2025-12-18.zip'),
  'Foundation archiveUrl',
);
assert(
  typeof foundation.archiveSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(foundation.archiveSha256),
  'Foundation archiveSha256',
);
assert(srLegacy.dataType === 'SR Legacy', 'SR Legacy dataType');
assert(srLegacy.release === '2018-04', 'SR Legacy release');
assert(
  typeof srLegacy.archiveUrl === 'string' &&
    srLegacy.archiveUrl.includes('sr_legacy_food_json_2018-04.zip'),
  'SR Legacy archiveUrl',
);
assert(
  typeof srLegacy.archiveSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(srLegacy.archiveSha256),
  'SR Legacy archiveSha256',
);

const ids = new Set();
const fdcIds = new Set();
for (const entry of catalog.entries) {
  assert(Number.isInteger(entry.fdcId) && entry.fdcId > 0, `fdcId ${entry.fdcId}`);
  assert(!fdcIds.has(entry.fdcId), `duplicate fdcId ${entry.fdcId}`);
  fdcIds.add(entry.fdcId);

  assert(
    typeof entry.polishName === 'string' && entry.polishName.length > 0,
    `polishName for ${entry.fdcId}`,
  );
  assert(
    entry.dataType === 'Foundation' || entry.dataType === 'SR Legacy',
    `dataType ${entry.dataType} for ${entry.fdcId}`,
  );
  assert(
    entry.basis === '100 g części jadalnej',
    `basis for ${entry.fdcId}`,
  );

  const n = entry.nutrition;
  assert(n && typeof n === 'object', `nutrition for ${entry.fdcId}`);
  for (const key of ['kcal', 'proteinGrams', 'carbsGrams', 'fatGrams']) {
    assert(
      typeof n[key] === 'number' && Number.isFinite(n[key]) && n[key] >= 0,
      `${key} invalid for ${entry.fdcId}`,
    );
  }
  for (const key of ['fiberGrams', 'saltGrams', 'sodiumMg']) {
    if (n[key] !== null && n[key] !== undefined) {
      assert(
        typeof n[key] === 'number' && Number.isFinite(n[key]) && n[key] >= 0,
        `${key} invalid for ${entry.fdcId}`,
      );
    }
  }
  assert(ENERGY_FIELDS.has(n.energyField), `energyField for ${entry.fdcId}`);

  if (typeof n.sodiumMg === 'number' && typeof n.saltGrams === 'number') {
    const expectedSalt = Number(((n.sodiumMg * 2.5) / 1000).toFixed(3));
    assert(
      Math.abs(expectedSalt - Number(n.saltGrams.toFixed(3))) < 0.0015,
      `salt from sodium mismatch for ${entry.fdcId}: Na=${n.sodiumMg} salt=${n.saltGrams} expected=${expectedSalt}`,
    );
  }
}

assert(ids.size === 0 || ids.size === EXPECTED_COUNT, 'id uniqueness placeholder');
assert(fdcIds.size === EXPECTED_COUNT, 'fdcId uniqueness');

if (process.exitCode) {
  console.error('USDA catalog integrity check FAILED');
  process.exit(1);
}
console.log(
  JSON.stringify({
    ok: true,
    entryCount: EXPECTED_COUNT,
    entriesSha256,
    foundationArchiveSha256: foundation.archiveSha256,
    srLegacyArchiveSha256: srLegacy.archiveSha256,
  }),
);
