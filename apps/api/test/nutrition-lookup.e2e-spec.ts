import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
  type TestUser,
} from './create-api-app';

const WEB_ORIGIN = 'http://127.0.0.1:3010';

const FOUND_EAN = '3017624010701';
const MISSING_EAN = '0000000000000';
const INCOMPLETE_EAN = '5901234123457';
const RATE_LIMIT_EAN = '5909999999999';
const ERROR_EAN = '5908888888888';

function readUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://127.0.0.1');
}

async function startOffMock(): Promise<{
  origin: string;
  server: Server;
  hits: Map<string, number>;
}> {
  const hits = new Map<string, number>();

  const server = createServer((req, res) => {
    const url = readUrl(req);
    const match = url.pathname.match(/^\/api\/v2\/product\/(\d+)\.json$/);
    if (!match) {
      res.writeHead(404);
      res.end('not found');
      return;
    }

    const ean = match[1]!;
    hits.set(ean, (hits.get(ean) ?? 0) + 1);

    if (ean === RATE_LIMIT_EAN) {
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'rate limit' }));
      return;
    }
    if (ean === ERROR_EAN) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'boom' }));
      return;
    }
    if (ean === MISSING_EAN) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ status: 0, status_verbose: 'product not found' }),
      );
      return;
    }
    if (ean === INCOMPLETE_EAN) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 1,
          product: {
            product_name: 'Sok bez makro',
            brands: 'Test',
            nutrition_data_per: '100ml',
            nutriments: { 'energy-kcal_100g': 45, carbohydrates_100g: 10 },
          },
        }),
      );
      return;
    }
    if (ean === FOUND_EAN) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 1,
          code: FOUND_EAN,
          product: {
            product_name: 'Nutella',
            brands: 'Ferrero',
            nutrition_data_per: '100g',
            nutriments: {
              'energy-kcal_100g': 539,
              proteins_100g: 6.3,
              carbohydrates_100g: 57.5,
              fat_100g: 30.9,
              salt_100g: 0.1075,
              sugars_100g: 56.3,
            },
          },
        }),
      );
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 0 }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
    hits,
  };
}

describe('Open Food Facts nutrition lookup (e2e)', () => {
  let api: RunningApi;
  let user: TestUser;
  let kitchenId: string;
  let mock: Awaited<ReturnType<typeof startOffMock>>;

  beforeAll(async () => {
    mock = await startOffMock();
    api = await startApiServer({
      OPEN_FOOD_FACTS_DRIVER: 'http',
      OPEN_FOOD_FACTS_BASE_URL: mock.origin,
      OPEN_FOOD_FACTS_TIMEOUT_MS: '2000',
      OPEN_FOOD_FACTS_CACHE_TTL_SECONDS: '3600',
    });
    user = await signUpUser(api.origin, WEB_ORIGIN, {
      email: `off.${Date.now()}@example.com`,
      password: 'DemoHaslo123!',
      name: 'OFF Tester',
    });
    const kitchen = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      cookies: user.cookies,
      body: { name: 'Kuchnia OFF' },
      webOrigin: WEB_ORIGIN,
    });
    expect(kitchen.status).toBe(201);
    kitchenId = (kitchen.body as { id: string }).id;
  }, 60_000);

  afterAll(() => {
    api?.stop();
    mock?.server.close();
  });

  it('returns found product with nutrition preview and does not mutate ProductNutrition', async () => {
    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products`,
      {
        method: 'POST',
        cookies: user.cookies,
        body: {
          name: `Nutella ${Date.now()}`,
          defaultUnit: 'gram',
          ean: FOUND_EAN,
        },
        webOrigin: WEB_ORIGIN,
      },
    );
    expect(productRes.status).toBe(201);
    const productId = (productRes.body as { id: string }).id;

    const before = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/nutrition`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(before.status).toBe(200);
    expect(before.body).toBeNull();

    const lookup = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/nutrition-lookups/by-ean?ean=${FOUND_EAN}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(lookup.status).toBe(200);
    const body = lookup.body as {
      status: string;
      productName: string;
      brand: string;
      attribution: string;
      nutrition: {
        baseUnit: string;
        kcal: string;
        fiberGrams: string | null;
      };
    };
    expect(body.status).toBe('found');
    expect(body.productName).toBe('Nutella');
    expect(body.brand).toBe('Ferrero');
    expect(body.attribution).toBe('Open Food Facts');
    expect(body.nutrition.baseUnit).toBe('gram');
    expect(body.nutrition.kcal).toBe('539.000');
    expect(body.nutrition.fiberGrams).toBeNull();

    const afterLookup = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/nutrition`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(afterLookup.body).toBeNull();
  });

  it('caches successful lookups and skips second provider call', async () => {
    const beforeHits = mock.hits.get(FOUND_EAN) ?? 0;
    const first = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/nutrition-lookups/by-ean?ean=${FOUND_EAN}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(first.status).toBe(200);
    const midHits = mock.hits.get(FOUND_EAN) ?? 0;

    const second = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/nutrition-lookups/by-ean?ean=${FOUND_EAN}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(second.status).toBe(200);
    expect(mock.hits.get(FOUND_EAN) ?? 0).toBe(midHits);
    expect(midHits).toBeGreaterThanOrEqual(beforeHits);
  });

  it('returns not_found for missing product', async () => {
    const lookup = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/nutrition-lookups/by-ean?ean=${MISSING_EAN}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(lookup.status).toBe(200);
    const body = lookup.body as { status: string; nutrition: unknown };
    expect(body.status).toBe('not_found');
    expect(body.nutrition).toBeNull();
  });

  it('returns incomplete without inventing zeros', async () => {
    const lookup = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/nutrition-lookups/by-ean?ean=${INCOMPLETE_EAN}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(lookup.status).toBe(200);
    const body = lookup.body as {
      status: string;
      nutrition: unknown;
      missingFields: string[];
    };
    expect(body.status).toBe('incomplete');
    expect(body.nutrition).toBeNull();
    expect(body.missingFields).toEqual(
      expect.arrayContaining(['proteinGrams', 'fatGrams']),
    );
  });

  it('maps provider rate limit and http errors', async () => {
    const limited = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/nutrition-lookups/by-ean?ean=${RATE_LIMIT_EAN}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(limited.status).toBe(200);
    expect((limited.body as { status: string }).status).toBe('rate_limited');

    const errored = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/nutrition-lookups/by-ean?ean=${ERROR_EAN}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(errored.status).toBe(200);
    expect((errored.body as { status: string }).status).toBe('provider_error');
  });

  it('rejects invalid EAN and stores provenance only after explicit save', async () => {
    const bad = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/nutrition-lookups/by-ean?ean=123`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(bad.status).toBe(400);

    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products`,
      {
        method: 'POST',
        cookies: user.cookies,
        body: {
          name: `Mleko OFF ${Date.now()}`,
          defaultUnit: 'gram',
        },
        webOrigin: WEB_ORIGIN,
      },
    );
    const productId = (productRes.body as { id: string }).id;

    const manual = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/nutrition`,
      {
        method: 'PUT',
        cookies: user.cookies,
        body: {
          baseQuantity: '100.000',
          baseUnit: 'gram',
          kcal: '10.000',
          proteinGrams: '1.000',
          carbsGrams: '1.000',
          fatGrams: '1.000',
        },
        webOrigin: WEB_ORIGIN,
      },
    );
    expect(manual.status).toBe(200);
    expect((manual.body as { source: string }).source).toBe('manual');

    const lookup = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/nutrition-lookups/by-ean?ean=${FOUND_EAN}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    const preview = lookup.body as {
      fetchedAt: string;
      productName: string;
      brand: string;
      nutrition: Record<string, string | null>;
    };

    const stillManual = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/nutrition`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect((stillManual.body as { kcal: string }).kcal).toBe('10.000');
    expect((stillManual.body as { source: string }).source).toBe('manual');

    const approved = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/nutrition`,
      {
        method: 'PUT',
        cookies: user.cookies,
        body: {
          baseQuantity: preview.nutrition.baseQuantity,
          baseUnit: preview.nutrition.baseUnit,
          kcal: preview.nutrition.kcal,
          proteinGrams: preview.nutrition.proteinGrams,
          carbsGrams: preview.nutrition.carbsGrams,
          fatGrams: preview.nutrition.fatGrams,
          fiberGrams: preview.nutrition.fiberGrams,
          saltGrams: preview.nutrition.saltGrams,
          source: 'open_food_facts',
          sourceFetchedAt: preview.fetchedAt,
          sourceLabel: preview.productName,
          sourceBrand: preview.brand,
        },
        webOrigin: WEB_ORIGIN,
      },
    );
    expect(approved.status).toBe(200);
    const saved = approved.body as {
      source: string;
      sourceLabel: string;
      sourceBrand: string;
      sourceFetchedAt: string;
      kcal: string;
    };
    expect(saved.source).toBe('open_food_facts');
    expect(saved.sourceLabel).toBe('Nutella');
    expect(saved.sourceBrand).toBe('Ferrero');
    expect(saved.sourceFetchedAt).toBe(preview.fetchedAt);
    expect(saved.kcal).toBe('539.000');
  });

  it('rejects open_food_facts save without sourceFetchedAt', async () => {
    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products`,
      {
        method: 'POST',
        cookies: user.cookies,
        body: {
          name: `Bez daty ${Date.now()}`,
          defaultUnit: 'gram',
        },
        webOrigin: WEB_ORIGIN,
      },
    );
    const productId = (productRes.body as { id: string }).id;
    const res = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/nutrition`,
      {
        method: 'PUT',
        cookies: user.cookies,
        body: {
          baseQuantity: '100.000',
          baseUnit: 'gram',
          kcal: '1.000',
          proteinGrams: '1.000',
          carbsGrams: '1.000',
          fatGrams: '1.000',
          source: 'open_food_facts',
        },
        webOrigin: WEB_ORIGIN,
      },
    );
    expect(res.status).toBe(400);
  });
});
