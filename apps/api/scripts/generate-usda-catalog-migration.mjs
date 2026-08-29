/**
 * Generuje migration.sql z danymi katalogu USDA v1 (tylko narzędzie deweloperskie).
 * Wynik: prisma/migrations/20260829121000_usda_catalog_v1_seed/migration.sql
 *
 *   node scripts/generate-usda-catalog-migration.mjs
 */
import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, '..');
const CATALOG_DIR = join(API_ROOT, 'data', 'usda-catalog', 'v1');
const MIGRATION_NAME = '20260829121000_usda_catalog_v1_seed';
const OUT_DIR = join(API_ROOT, 'prisma', 'migrations', MIGRATION_NAME);

/** Namespace UUID for deterministic catalog row ids (v5-style via HMAC). */
const ID_NAMESPACE = 'moja-kuchnia:usda-catalog:v1';

function stableUuidFromFdcId(fdcId) {
  const digest = createHmac('sha256', ID_NAMESPACE)
    .update(String(fdcId))
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeProductName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeSearchText(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ');
}

function buildSearchText(polishName, aliases) {
  return [polishName, ...aliases].map(normalizeSearchText).join(' ');
}

function sqlString(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function sqlDecimal(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return Number(value).toFixed(3);
}

function sqlBool(value) {
  return value ? 'TRUE' : 'FALSE';
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const catalog = JSON.parse(
  readFileSync(join(CATALOG_DIR, 'entries.json'), 'utf8'),
);
if (catalog.entries.length !== 91) {
  throw new Error(`Oczekiwano 91 rekordów, jest ${catalog.entries.length}`);
}

const importedAt = `${catalog.importedAt}T00:00:00.000Z`;
const lines = [];
lines.push('-- Seed katalogu USDA v1 (Foundation Foods + SR Legacy).');
lines.push('-- Dane wbudowane w migrację — bez sieci, Node i tmp-usda.');
lines.push('-- Idempotentne: ON CONFLICT (fdcId); nie zmienia ProductNutrition.');
lines.push('-- Stabilne id: HMAC-SHA256(namespace, fdcId) → UUID v5-style.');
lines.push('');

for (const entry of catalog.entries) {
  const aliases = entry.aliases ?? [];
  const n = entry.nutrition;
  const sourceDataset =
    entry.dataType === 'Foundation' || entry.dataType === 'Foundation Foods'
      ? 'Foundation Foods'
      : 'SR Legacy';
  const sourceRelease = sourceDataset === 'Foundation Foods' ? '2025-12-18' : '2018-04';
  const id = stableUuidFromFdcId(entry.fdcId);
  const searchText = buildSearchText(entry.polishName, aliases);

  lines.push(`INSERT INTO "UsdaFoodCatalogEntry" (`);
  lines.push(
    `  id, "fdcId", "polishName", "polishNameNormalized", aliases, "searchText",`,
  );
  lines.push(
    `  "descriptionOriginal", "variantLabel", "dataType", category, "compositionMayVary",`,
  );
  lines.push(
    `  "basisLabel", "sourceDataset", "sourceRelease", "sourceUrl", "catalogVersion",`,
  );
  lines.push(
    `  "importedAt", "publicationDate", kcal, "proteinGrams", "carbsGrams", "fatGrams",`,
  );
  lines.push(
    `  "fiberGrams", "saltGrams", "sodiumMg", "energyField", "carbsMethod",`,
  );
  lines.push(`  "carbsApproximate", "mappingWarnings"`);
  lines.push(`) VALUES (`);
  lines.push(
    `  ${sqlString(id)}, ${entry.fdcId}, ${sqlString(entry.polishName)}, ${sqlString(normalizeProductName(entry.polishName))},`,
  );
  lines.push(
    `  ${sqlJson(aliases)}, ${sqlString(searchText)},`,
  );
  lines.push(
    `  ${sqlString(entry.descriptionOriginal)}, ${sqlString(entry.variantLabel)}, ${sqlString(entry.dataType)}, ${sqlString(entry.category)}, ${sqlBool(Boolean(entry.compositionMayVary))},`,
  );
  lines.push(
    `  ${sqlString(entry.basis ?? '100 g części jadalnej')}, ${sqlString(sourceDataset)}, ${sqlString(sourceRelease)},`,
  );
  lines.push(
    `  ${sqlString('https://fdc.nal.usda.gov/')}, ${sqlString(catalog.catalogVersion)},`,
  );
  lines.push(
    `  ${sqlString(importedAt)}::timestamptz, ${sqlString(entry.publicationDate)},`,
  );
  lines.push(
    `  ${sqlDecimal(n.kcal)}, ${sqlDecimal(n.proteinGrams)}, ${sqlDecimal(n.carbsGrams)}, ${sqlDecimal(n.fatGrams)},`,
  );
  lines.push(
    `  ${sqlDecimal(n.fiberGrams)}, ${sqlDecimal(n.saltGrams)}, ${sqlDecimal(n.sodiumMg)},`,
  );
  lines.push(
    `  ${sqlString(n.energyField)}, ${sqlString(n.carbsMethod)}, ${sqlBool(Boolean(n.carbsApproximate))}, ${sqlJson(entry.mappingWarnings ?? [])}`,
  );
  lines.push(`)`);
  lines.push(`ON CONFLICT ("fdcId") DO UPDATE SET`);
  lines.push(`  "polishName" = EXCLUDED."polishName",`);
  lines.push(`  "polishNameNormalized" = EXCLUDED."polishNameNormalized",`);
  lines.push(`  aliases = EXCLUDED.aliases,`);
  lines.push(`  "searchText" = EXCLUDED."searchText",`);
  lines.push(`  "descriptionOriginal" = EXCLUDED."descriptionOriginal",`);
  lines.push(`  "variantLabel" = EXCLUDED."variantLabel",`);
  lines.push(`  "dataType" = EXCLUDED."dataType",`);
  lines.push(`  category = EXCLUDED.category,`);
  lines.push(`  "compositionMayVary" = EXCLUDED."compositionMayVary",`);
  lines.push(`  "basisLabel" = EXCLUDED."basisLabel",`);
  lines.push(`  "sourceDataset" = EXCLUDED."sourceDataset",`);
  lines.push(`  "sourceRelease" = EXCLUDED."sourceRelease",`);
  lines.push(`  "sourceUrl" = EXCLUDED."sourceUrl",`);
  lines.push(`  "catalogVersion" = EXCLUDED."catalogVersion",`);
  lines.push(`  "importedAt" = EXCLUDED."importedAt",`);
  lines.push(`  "publicationDate" = EXCLUDED."publicationDate",`);
  lines.push(`  kcal = EXCLUDED.kcal,`);
  lines.push(`  "proteinGrams" = EXCLUDED."proteinGrams",`);
  lines.push(`  "carbsGrams" = EXCLUDED."carbsGrams",`);
  lines.push(`  "fatGrams" = EXCLUDED."fatGrams",`);
  lines.push(`  "fiberGrams" = EXCLUDED."fiberGrams",`);
  lines.push(`  "saltGrams" = EXCLUDED."saltGrams",`);
  lines.push(`  "sodiumMg" = EXCLUDED."sodiumMg",`);
  lines.push(`  "energyField" = EXCLUDED."energyField",`);
  lines.push(`  "carbsMethod" = EXCLUDED."carbsMethod",`);
  lines.push(`  "carbsApproximate" = EXCLUDED."carbsApproximate",`);
  lines.push(`  "mappingWarnings" = EXCLUDED."mappingWarnings";`);
  lines.push('');
}

mkdirSync(OUT_DIR, { recursive: true });
const sqlPath = join(OUT_DIR, 'migration.sql');
writeFileSync(sqlPath, `${lines.join('\n')}\n`, 'utf8');

// Refresh manifest with extended integrity fields.
const foundationZip = join(API_ROOT, 'tmp-usda', 'foundation.zip');
const srZip = join(API_ROOT, 'tmp-usda', 'sr-legacy.zip');
const entriesPath = join(CATALOG_DIR, 'entries.json');
const entriesRaw = readFileSync(entriesPath);
const entriesSha256 = createHash('sha256').update(entriesRaw).digest('hex');
const entriesArraySha256 = createHash('sha256')
  .update(JSON.stringify(catalog.entries))
  .digest('hex');

const foundationArchiveUrl =
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2025-12-18.zip';
const srArchiveUrl =
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip';

const manifest = {
  formatVersion: 'usda-catalog-v1',
  catalogVersion: catalog.catalogVersion,
  entryCount: catalog.entries.length,
  importedAt: catalog.importedAt,
  license: catalog.license,
  entriesFile: 'entries.json',
  entriesSha256,
  entriesArraySha256,
  sources: [
    {
      dataType: 'Foundation Foods',
      release: '2025-12-18',
      releaseDate: '2025-12-18',
      archiveFile: 'FoodData_Central_foundation_food_json_2025-12-18.zip',
      archiveUrl: foundationArchiveUrl,
      archiveSha256: existsSync(foundationZip)
        ? hashFile(foundationZip).toLowerCase()
        : null,
      extractedJsonFile: 'FoodData_Central_foundation_food_json_2025-12-18.json',
      extractedJsonSha256: catalog.sources[0]?.sha256 ?? null,
      downloadPageUrl: 'https://fdc.nal.usda.gov/download-datasets/',
    },
    {
      dataType: 'SR Legacy',
      release: '2018-04',
      releaseDate: '2018-04',
      archiveFile: 'FoodData_Central_sr_legacy_food_json_2018-04.zip',
      archiveUrl: srArchiveUrl,
      archiveSha256: existsSync(srZip) ? hashFile(srZip).toLowerCase() : null,
      extractedJsonFile: 'FoodData_Central_sr_legacy_food_json_2018-04.json',
      extractedJsonSha256: catalog.sources[1]?.sha256 ?? null,
      downloadPageUrl: 'https://fdc.nal.usda.gov/download-datasets/',
    },
  ],
  missingFdcIds: [],
  incompleteFdcIds: [],
};

if (!manifest.sources[0].archiveSha256 || !manifest.sources[1].archiveSha256) {
  throw new Error(
    'Brak SHA-256 archiwów ZIP w tmp-usda/. Pobierz foundation.zip i sr-legacy.zip lokalnie, aby wygenerować manifest.',
  );
}

writeFileSync(
  join(CATALOG_DIR, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log('Wrote', sqlPath);
console.log('Updated manifest.json entriesSha256=', entriesSha256);
console.log('Stable id sample fdc=1750340', stableUuidFromFdcId(1750340));
