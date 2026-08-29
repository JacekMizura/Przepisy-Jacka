/**
 * Idempotentna synchronizacja katalogu USDA (bez Nest / bez seeda aplikacji).
 *
 *   pnpm --filter @moja-kuchnia/api usda:sync-catalog
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '../.env') });

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

function dec(value) {
  if (value === null || value === undefined) return null;
  return Number(value).toFixed(3);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL jest wymagane.');
  }

  const catalogDir = join(__dirname, '../data/usda-catalog/v1');
  const file = JSON.parse(readFileSync(join(catalogDir, 'entries.json'), 'utf8'));
  const importedAt = new Date(`${file.importedAt}T00:00:00.000Z`);
  const keepFdcIds = file.entries.map((e) => e.fdcId);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    let upserted = 0;
    for (const entry of file.entries) {
      const aliases = entry.aliases ?? [];
      const n = entry.nutrition;
      const sourceDataset =
        entry.dataType === 'Foundation' || entry.dataType === 'Foundation Foods'
          ? 'Foundation Foods'
          : 'SR Legacy';
      const sourceRelease = entry.dataType.includes('Foundation')
        ? '2025-12-18'
        : '2018-04';

      const existing = await client.query(
        `SELECT id FROM "UsdaFoodCatalogEntry" WHERE "fdcId" = $1`,
        [entry.fdcId],
      );
      const id = existing.rows[0]?.id ?? randomUUID();

      await client.query(
        `INSERT INTO "UsdaFoodCatalogEntry" (
          id, "fdcId", "polishName", "polishNameNormalized", aliases, "searchText",
          "descriptionOriginal", "variantLabel", "dataType", category, "compositionMayVary",
          "basisLabel", "sourceDataset", "sourceRelease", "sourceUrl", "catalogVersion",
          "importedAt", "publicationDate", kcal, "proteinGrams", "carbsGrams", "fatGrams",
          "fiberGrams", "saltGrams", "sodiumMg", "energyField", "carbsMethod",
          "carbsApproximate", "mappingWarnings"
        ) VALUES (
          $1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29::jsonb
        )
        ON CONFLICT ("fdcId") DO UPDATE SET
          "polishName" = EXCLUDED."polishName",
          "polishNameNormalized" = EXCLUDED."polishNameNormalized",
          aliases = EXCLUDED.aliases,
          "searchText" = EXCLUDED."searchText",
          "descriptionOriginal" = EXCLUDED."descriptionOriginal",
          "variantLabel" = EXCLUDED."variantLabel",
          "dataType" = EXCLUDED."dataType",
          category = EXCLUDED.category,
          "compositionMayVary" = EXCLUDED."compositionMayVary",
          "basisLabel" = EXCLUDED."basisLabel",
          "sourceDataset" = EXCLUDED."sourceDataset",
          "sourceRelease" = EXCLUDED."sourceRelease",
          "sourceUrl" = EXCLUDED."sourceUrl",
          "catalogVersion" = EXCLUDED."catalogVersion",
          "importedAt" = EXCLUDED."importedAt",
          "publicationDate" = EXCLUDED."publicationDate",
          kcal = EXCLUDED.kcal,
          "proteinGrams" = EXCLUDED."proteinGrams",
          "carbsGrams" = EXCLUDED."carbsGrams",
          "fatGrams" = EXCLUDED."fatGrams",
          "fiberGrams" = EXCLUDED."fiberGrams",
          "saltGrams" = EXCLUDED."saltGrams",
          "sodiumMg" = EXCLUDED."sodiumMg",
          "energyField" = EXCLUDED."energyField",
          "carbsMethod" = EXCLUDED."carbsMethod",
          "carbsApproximate" = EXCLUDED."carbsApproximate",
          "mappingWarnings" = EXCLUDED."mappingWarnings"
        `,
        [
          id,
          entry.fdcId,
          entry.polishName,
          normalizeProductName(entry.polishName),
          JSON.stringify(aliases),
          buildSearchText(entry.polishName, aliases),
          entry.descriptionOriginal,
          entry.variantLabel,
          entry.dataType,
          entry.category,
          entry.compositionMayVary,
          entry.basis,
          sourceDataset,
          sourceRelease,
          `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${entry.fdcId}/nutrients`,
          file.catalogVersion,
          importedAt.toISOString(),
          entry.publicationDate,
          dec(n.kcal),
          dec(n.proteinGrams),
          dec(n.carbsGrams),
          dec(n.fatGrams),
          dec(n.fiberGrams),
          dec(n.saltGrams),
          dec(n.sodiumMg),
          n.energyField,
          n.carbsMethod,
          n.carbsApproximate,
          JSON.stringify(entry.mappingWarnings ?? []),
        ],
      );
      upserted += 1;
    }

    const stale = await client.query(
      `DELETE FROM "UsdaFoodCatalogEntry"
       WHERE "catalogVersion" <> $1 OR NOT ("fdcId" = ANY($2::int[]))
       RETURNING id`,
      [file.catalogVersion, keepFdcIds],
    );

    const result = {
      catalogVersion: file.catalogVersion,
      upserted,
      removed: stale.rowCount ?? 0,
      entriesSha256: createHash('sha256')
        .update(readFileSync(join(catalogDir, 'entries.json')))
        .digest('hex'),
    };
    console.log(JSON.stringify(result));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
