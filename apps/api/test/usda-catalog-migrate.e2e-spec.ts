/**
 * E2e: katalog USDA wypełniany wyłącznie przez prisma migrate deploy
 * (bez usda:sync-catalog).
 *
 * Preferuje pustą bazę (CREATE DATABASE). Gdy rola nie ma CREATEDB
 * (częste lokalnie poza obrazem docker z POSTGRES_USER), używa fallbacku:
 * wycina seed z `_prisma_migrations` + TRUNCATE katalogu i ponownie
 * odpala wyłącznie migrację seed przez `migrate deploy`.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import pg from 'pg';

import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
} from './create-api-app';
import { applyTestEnv } from './test-env';

jest.setTimeout(180_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';
const ADMIN_URL =
  process.env.DATABASE_URL ??
  'postgresql://moja_kuchnia:moja_kuchnia_dev@127.0.0.1:5432/moja_kuchnia';
const ID_NAMESPACE = 'moja-kuchnia:usda-catalog:v1';
const SEED_MIGRATION = '20260829121000_usda_catalog_v1_seed';

type CountRow = { c: number };

type CatalogRow = {
  id: string;
  fdcId: number;
  polishName: string;
  kcal: string;
  proteinGrams: string;
  fatGrams: string;
  carbsGrams: string;
  fiberGrams: string | null;
  saltGrams: string | null;
  sodiumMg: string | null;
  energyField: string;
  dataType: string;
};

type NutritionRow = {
  kcal: string;
  proteinGrams: string;
  sourceGenericFoodId: string | null;
  sourceFdcId: number | null;
};

type RoleRow = { canCreate: boolean };

function stableUuidFromFdcId(fdcId: number): string {
  const digest = createHmac('sha256', ID_NAMESPACE)
    .update(String(fdcId))
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertSafeDatabaseUrl(url: string): void {
  const lower = url.toLowerCase();
  if (
    lower.includes('railway') ||
    lower.includes('rlwy.net') ||
    lower.includes('vercel-storage')
  ) {
    throw new Error('Test nie może używać produkcyjnej bazy.');
  }
}

function migrateDeploy(databaseUrl: string): string {
  const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '..'),
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ALLOW_DEMO_SEED: 'false',
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `migrate deploy failed:\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

describe('USDA catalog via migrate deploy only (e2e)', () => {
  const dbName = `usda_migrate_${Date.now()}_${randomUUID().slice(0, 8)}`;
  let admin: pg.Client;
  let dbUrl = '';
  let isolatedDb = false;
  let api: RunningApi | undefined;

  beforeAll(async () => {
    assertSafeDatabaseUrl(ADMIN_URL);
    admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();

    const role = await admin.query<RoleRow>(
      `SELECT (rolcreatedb OR rolsuper) AS "canCreate"
       FROM pg_roles WHERE rolname = current_user`,
    );
    if (role.rows[0]?.canCreate) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
      const u = new URL(ADMIN_URL);
      u.pathname = `/${dbName}`;
      dbUrl = u.toString();
      isolatedDb = true;
    } else {
      if (process.env.CI === 'true') {
        throw new Error(
          'CI wymaga CREATEDB (pusta baza). Rola POSTGRES_USER w postgres service musi móc CREATE DATABASE.',
        );
      }
      // Lokalnie bez CREATEDB: symuluj pusty katalog i oczekującą migrację seed.
      dbUrl = ADMIN_URL;
      isolatedDb = false;
      await admin.query(`TRUNCATE TABLE "UsdaFoodCatalogEntry"`);
      await admin.query(
        `DELETE FROM "_prisma_migrations" WHERE migration_name = $1`,
        [SEED_MIGRATION],
      );
    }
  });

  afterAll(async () => {
    api?.stop();
    if (admin) {
      if (isolatedDb) {
        await admin
          .query(
            `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
            [dbName],
          )
          .catch(() => undefined);
        await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      }
      await admin.end();
    }
  });

  it('wypełnia 91 rekordów samym migrate deploy, bez sync-catalog i bez duplikatów', async () => {
    const first = migrateDeploy(dbUrl);
    expect(first).toContain(SEED_MIGRATION);

    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    try {
      const count = await client.query<CountRow>(
        `SELECT COUNT(*)::int AS c FROM "UsdaFoodCatalogEntry"`,
      );
      expect(count.rows[0]?.c).toBe(91);

      const apple = await client.query<CatalogRow>(
        `SELECT id, "fdcId", "polishName", kcal, "proteinGrams", "fatGrams", "carbsGrams", "fiberGrams", "saltGrams", "sodiumMg", "energyField", "dataType"
         FROM "UsdaFoodCatalogEntry" WHERE "fdcId" = 1750340`,
      );
      expect(apple.rows).toHaveLength(1);
      const appleRow = apple.rows[0]!;
      expect(appleRow.id).toBe(stableUuidFromFdcId(1750340));
      expect(appleRow.polishName).toMatch(/jabłko/i);
      expect(appleRow.dataType).toBe('Foundation');
      expect(Number(appleRow.kcal)).toBeCloseTo(58.2, 2);
      expect(Number(appleRow.proteinGrams)).toBeCloseTo(0.148, 3);
      expect(Number(appleRow.fatGrams)).toBeCloseTo(0.162, 3);
      expect(Number(appleRow.carbsGrams)).toBeCloseTo(13.62, 2);
      expect(Number(appleRow.fiberGrams)).toBeCloseTo(2.08, 2);
      expect(Number(appleRow.sodiumMg)).toBeCloseTo(1.01, 2);
      expect(Number(appleRow.saltGrams)).toBeCloseTo((1.01 * 2.5) / 1000, 3);
      expect(appleRow.energyField).toBe('2048_atwater_specific');

      const granny = await client.query<CatalogRow>(
        `SELECT id, "fdcId", "polishName", kcal, "proteinGrams", "fatGrams", "carbsGrams", "fiberGrams", "saltGrams", "sodiumMg", "energyField", "dataType"
         FROM "UsdaFoodCatalogEntry" WHERE "fdcId" = 168203`,
      );
      const grannyRow = granny.rows[0]!;
      expect(grannyRow.dataType).toBe('SR Legacy');
      expect(Number(grannyRow.kcal)).toBeCloseTo(58, 1);
      expect(grannyRow.energyField).toBe('1008_energy_kcal');
      expect(Number(grannyRow.saltGrams)).toBeCloseTo(0.003, 3);
    } finally {
      await client.end();
    }

    applyTestEnv({ DATABASE_URL: dbUrl });
    api = await startApiServer({ DATABASE_URL: dbUrl });
    const user = await signUpUser(api.origin, WEB_ORIGIN, {
      email: `usda.api.${Date.now()}@example.com`,
      password: 'DemoHaslo123!',
      name: 'USDA Migrate',
    });
    const kitchen = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      cookies: user.cookies,
      body: { name: 'Kuchnia migrate' },
      webOrigin: WEB_ORIGIN,
    });
    expect(kitchen.status).toBe(201);
    const kitchenId = (kitchen.body as { id: string }).id;

    const search = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods?q=${encodeURIComponent('jabłko')}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(search.status).toBe(200);
    const items = (
      search.body as { items: Array<{ fdcId: number; id: string }> }
    ).items;
    expect(items.length).toBeGreaterThan(0);
    const appleItem = items.find((i) => i.fdcId === 1750340);
    expect(appleItem).toBeDefined();

    const detail = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods/${appleItem!.id}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(detail.status).toBe(200);

    const suggest = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods/${appleItem!.id}/suggest?productUnit=gram`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(suggest.status).toBe(200);
    const suggested = (
      suggest.body as {
        suggested: {
          kcal: string;
          proteinGrams: string;
          fatGrams: string;
          carbsGrams: string;
          fiberGrams: string | null;
          saltGrams: string | null;
        };
      }
    ).suggested;
    expect(Number(suggested.kcal)).toBeCloseTo(58.2, 1);

    const product = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products`,
      {
        method: 'POST',
        cookies: user.cookies,
        webOrigin: WEB_ORIGIN,
        body: { name: `Pomidor migrate ${Date.now()}`, defaultUnit: 'gram' },
      },
    );
    expect(product.status).toBe(201);
    const productId = (product.body as { id: string }).id;

    const nutritionPut = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/nutrition`,
      {
        method: 'PUT',
        cookies: user.cookies,
        webOrigin: WEB_ORIGIN,
        body: {
          baseQuantity: '100',
          baseUnit: 'gram',
          kcal: '999',
          proteinGrams: '1',
          carbsGrams: '2',
          fatGrams: '3',
          fiberGrams: '4',
          saltGrams: '5',
          source: 'usda_fdc',
          sourceFetchedAt: new Date().toISOString(),
          sourceGenericFoodId: appleItem!.id,
          sourceFdcId: 1750340,
          sourceLabel: 'snapshot test',
        },
      },
    );
    expect(nutritionPut.status).toBe(200);

    // Ponowny migrate deploy — bez duplikatów i bez nadpisania ProductNutrition.
    migrateDeploy(dbUrl);
    const client2 = new pg.Client({ connectionString: dbUrl });
    await client2.connect();
    try {
      const count2 = await client2.query<CountRow>(
        `SELECT COUNT(*)::int AS c FROM "UsdaFoodCatalogEntry"`,
      );
      expect(count2.rows[0]?.c).toBe(91);
      const nutrition = await client2.query<NutritionRow>(
        `SELECT kcal, "proteinGrams", "sourceGenericFoodId", "sourceFdcId"
         FROM "ProductNutrition" WHERE "productId" = $1`,
        [productId],
      );
      const nutritionRow = nutrition.rows[0]!;
      expect(Number(nutritionRow.kcal)).toBe(999);
      expect(Number(nutritionRow.proteinGrams)).toBe(1);
      expect(nutritionRow.sourceGenericFoodId).toBe(appleItem!.id);
      expect(nutritionRow.sourceFdcId).toBe(1750340);
    } finally {
      await client2.end();
    }

    const entriesRaw = readFileSync(
      resolve(__dirname, '../data/usda-catalog/v1/entries.json'),
    );
    const manifest = JSON.parse(
      readFileSync(
        resolve(__dirname, '../data/usda-catalog/v1/manifest.json'),
        'utf8',
      ),
    ) as { entriesSha256: string; entryCount: number };
    expect(manifest.entryCount).toBe(91);
    expect(createHash('sha256').update(entriesRaw).digest('hex')).toBe(
      manifest.entriesSha256,
    );
  });
});
