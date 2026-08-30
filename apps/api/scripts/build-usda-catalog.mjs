import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(__dirname, '..');
const TMP = join(API_ROOT, 'tmp-usda');
const OUT_DIR = join(API_ROOT, 'data', 'usda-catalog', 'v2');

const NUTRIENT = {
  energyKcal: 1008,
  energyKj: 1009,
  protein: 1003,
  fat: 1004,
  carbByDifference: 1005,
  fiber: 1079,
  sodium: 1093,
  energyAtwaterGeneral: 2047,
  energyAtwaterSpecific: 2048,
};

function loadUsdaJson(dir, key) {
  if (!existsSync(dir)) {
    throw new Error(`Brak katalogu ${dir}`);
  }
  const file = readdirSync(dir).find((f) => f.endsWith('.json'));
  if (!file) throw new Error(`Brak pliku JSON w ${dir}`);
  const raw = readFileSync(join(dir, file));
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const parsed = JSON.parse(raw.toString('utf8'));
  return { foods: parsed[key], sha256, file };
}

function readingsFromFood(food) {
  return (food.foodNutrients ?? [])
    .map((n) => ({
      nutrientId: n.nutrient?.id ?? n.nutrientId ?? null,
      amount: typeof n.amount === 'number' ? n.amount : null,
      unitName: n.nutrient?.unitName ?? null,
    }))
    .filter((r) => typeof r.nutrientId === 'number');
}

function mapNutrients(readings) {
  const warnings = [];
  const read = (id) => {
    const hit = readings.find((r) => r.nutrientId === id);
    if (!hit || hit.amount === null || !Number.isFinite(hit.amount)) return null;
    return hit;
  };

  let kcal = null;
  let energyField = null;
  const specific = read(NUTRIENT.energyAtwaterSpecific);
  const general = read(NUTRIENT.energyAtwaterGeneral);
  const energyKcal = read(NUTRIENT.energyKcal);
  const energyKj = read(NUTRIENT.energyKj);
  if (specific) {
    kcal = Number(specific.amount.toFixed(3));
    energyField = '2048_atwater_specific';
  } else if (general) {
    kcal = Number(general.amount.toFixed(3));
    energyField = '2047_atwater_general';
  } else if (energyKcal) {
    kcal = Number(energyKcal.amount.toFixed(3));
    energyField = '1008_energy_kcal';
  } else if (energyKj) {
    kcal = Number((energyKj.amount / 4.184).toFixed(3));
    energyField = '1009_energy_kj_converted';
    warnings.push('Energia z kJ (1009) przeliczona na kcal.');
  } else {
    warnings.push('Brak energii');
  }

  const protein = read(NUTRIENT.protein);
  const fat = read(NUTRIENT.fat);
  const carb = read(NUTRIENT.carbByDifference);
  const fiber = read(NUTRIENT.fiber);
  const sodium = read(NUTRIENT.sodium);

  let carbsGrams = null;
  let carbsMethod = null;
  let carbsApproximate = false;
  let fiberGrams = fiber ? Number(fiber.amount.toFixed(3)) : null;

  if (carb && fiber) {
    const available = carb.amount - fiber.amount;
    if (available < 0) {
      warnings.push('Ujemne węglowodany po odjęciu błonnika — odrzucono');
    } else {
      carbsGrams = Number(available.toFixed(3));
      carbsMethod = 'available_approx_carb_minus_fiber';
      carbsApproximate = true;
    }
  } else if (carb) {
    carbsGrams = Number(carb.amount.toFixed(3));
    carbsMethod = 'carb_by_difference_includes_fiber';
    carbsApproximate = true;
  }

  const sodiumMg = sodium ? Number(sodium.amount.toFixed(3)) : null;
  const saltGrams = sodium
    ? Number(((sodium.amount * 2.5) / 1000).toFixed(3))
    : null;

  const incomplete =
    kcal === null ||
    !protein ||
    !fat ||
    carbsGrams === null;

  return {
    kcal,
    energyField,
    proteinGrams: protein ? Number(protein.amount.toFixed(3)) : null,
    fatGrams: fat ? Number(fat.amount.toFixed(3)) : null,
    carbsGrams,
    carbsMethod,
    carbsApproximate,
    fiberGrams,
    saltGrams,
    sodiumMg,
    warnings,
    incomplete,
  };
}

function indexByFdc(foods) {
  const map = new Map();
  for (const food of foods) {
    map.set(food.fdcId, food);
  }
  return map;
}

const selectionJsonPath = join(
  API_ROOT,
  'src/usda-catalog/catalog-selection.json',
);
if (!existsSync(selectionJsonPath)) {
  throw new Error(
    `Brak ${selectionJsonPath}. Wygeneruj: node --experimental-strip-types -e "import { USDA_CATALOG_SELECTION as s, USDA_CATALOG_VERSION as v, USDA_FOUNDATION_RELEASE as f, USDA_SR_LEGACY_RELEASE as r } from './src/usda-catalog/catalog-selection.ts'; import { writeFileSync } from 'fs'; writeFileSync('./src/usda-catalog/catalog-selection.json', JSON.stringify({ version: v, foundationRelease: f, srLegacyRelease: r, selection: s }, null, 2));"`,
  );
}
const meta = JSON.parse(readFileSync(selectionJsonPath, 'utf8'));

const foundation = loadUsdaJson(join(TMP, 'foundation'), 'FoundationFoods');
const srLegacy = loadUsdaJson(join(TMP, 'sr-legacy'), 'SRLegacyFoods');
const foundationIndex = indexByFdc(foundation.foods);
const srIndex = indexByFdc(srLegacy.foods);

const entries = [];
const missing = [];
const incomplete = [];

for (const sel of meta.selection) {
  let food = foundationIndex.get(sel.fdcId) ?? srIndex.get(sel.fdcId);
  if (!food && sel.preferDataType === 'Foundation') {
    food = foundationIndex.get(sel.fdcId);
  }
  if (!food) {
    missing.push(sel);
    continue;
  }
  if (
    sel.preferDataType === 'Foundation' &&
    food.dataType !== 'Foundation' &&
    foundationIndex.has(sel.fdcId)
  ) {
    food = foundationIndex.get(sel.fdcId);
  }

  const mapped = mapNutrients(readingsFromFood(food));
  if (mapped.incomplete) {
    incomplete.push({ fdcId: sel.fdcId, description: food.description, warnings: mapped.warnings });
    continue;
  }

  entries.push({
    fdcId: food.fdcId,
    polishName: sel.polishName,
    aliases: sel.aliases,
    descriptionOriginal: food.description,
    variantLabel: sel.variantLabel,
    dataType: food.dataType,
    category: food.foodCategory?.description ?? null,
    compositionMayVary: Boolean(sel.compositionMayVary),
    basis: '100 g części jadalnej',
    publicationDate: food.publicationDate ?? null,
    nutrition: {
      kcal: mapped.kcal,
      proteinGrams: mapped.proteinGrams,
      carbsGrams: mapped.carbsGrams,
      fatGrams: mapped.fatGrams,
      fiberGrams: mapped.fiberGrams,
      saltGrams: mapped.saltGrams,
      sodiumMg: mapped.sodiumMg,
      energyField: mapped.energyField,
      carbsMethod: mapped.carbsMethod,
      carbsApproximate: mapped.carbsApproximate,
    },
    mappingWarnings: mapped.warnings,
  });
}

mkdirSync(OUT_DIR, { recursive: true });
const catalog = {
  catalogVersion: meta.version,
  importedAt: new Date().toISOString().slice(0, 10),
  sources: [
    {
      dataType: 'Foundation Foods',
      release: meta.foundationRelease,
      file: foundation.file,
      sha256: foundation.sha256,
      url: 'https://fdc.nal.usda.gov/download-datasets/',
    },
    {
      dataType: 'SR Legacy',
      release: meta.srLegacyRelease,
      file: srLegacy.file,
      sha256: srLegacy.sha256,
      url: 'https://fdc.nal.usda.gov/download-datasets/',
    },
  ],
  license: 'USDA FoodData Central — public domain / CC0',
  entryCount: entries.length,
  entries,
};

const outPath = join(OUT_DIR, 'entries.json');
writeFileSync(outPath, JSON.stringify(catalog, null, 2));
writeFileSync(
  join(OUT_DIR, 'manifest.json'),
  JSON.stringify(
    {
      catalogVersion: catalog.catalogVersion,
      entryCount: entries.length,
      sources: catalog.sources,
      missingFdcIds: missing.map((m) => m.fdcId),
      incompleteFdcIds: incomplete.map((i) => i.fdcId),
      entriesSha256: createHash('sha256')
        .update(JSON.stringify(entries))
        .digest('hex'),
    },
    null,
    2,
  ),
);

console.log('Wrote', outPath, 'entries=', entries.length);
console.log('Missing', missing.map((m) => `${m.fdcId} ${m.polishName}`));
console.log('Incomplete', incomplete);
