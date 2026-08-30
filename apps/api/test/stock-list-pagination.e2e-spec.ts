import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
} from './create-api-app';
import { closeTestPool } from './pg-client';
import {
  asStockSummaryPage,
  flattenStockSummaryBody,
} from './stock-summary-helpers';

jest.setTimeout(90_000);

const WEB_ORIGIN = 'http://127.0.0.1:3025';

function daysFromNowIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

describe('stock-summary & catalog pagination (e2e)', () => {
  let api: RunningApi;

  beforeAll(async () => {
    api = await startApiServer({
      CORS_ORIGINS: WEB_ORIGIN,
      PUBLIC_WEB_ORIGIN: WEB_ORIGIN,
      BETTER_AUTH_URL: WEB_ORIGIN,
      AUTH_TRUSTED_ORIGINS: WEB_ORIGIN,
    });
  });

  afterAll(async () => {
    await closeTestPool();
    api.stop();
  });

  it('paginates stock-summary and filters before paging', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Lista zapasów' },
    });
    expect(kitchenRes.status).toBe(201);
    const kitchen = kitchenRes.body as { id: string };

    for (let i = 0; i < 6; i++) {
      const product = await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/products`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: {
            name: `Produkt listowy ${Date.now()}-${i}`,
            defaultUnit: 'gram',
            category: i % 2 === 0 ? 'Nabiał' : 'Warzywa i owoce',
          },
        },
      );
      expect(product.status).toBe(201);
      const productId = (product.body as { id: string }).id;
      const batch = await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/stock-items`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: {
            productId,
            quantity: '100.000',
            location: 'pantry',
            expiresAt: daysFromNowIso(i === 0 ? -1 : 30),
          },
        },
      );
      expect(batch.status).toBe(201);
    }

    const page1 = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-summary?page=1&limit=2&sort=name`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(page1.status).toBe(200);
    const body1 = asStockSummaryPage(page1.body);
    expect(body1.limit).toBe(2);
    expect(body1.page).toBe(1);
    expect(body1.total).toBeGreaterThanOrEqual(6);
    expect(body1.items.length).toBe(2);
    expect(body1.pageCount).toBeGreaterThanOrEqual(3);

    const filtered = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-summary?category=${encodeURIComponent('Nabiał')}&limit=100`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(filtered.status).toBe(200);
    const flat = flattenStockSummaryBody(filtered.body);
    expect(flat.length).toBeGreaterThanOrEqual(3);
    expect(flat.every((p) => p.category === 'Nabiał')).toBe(true);
    expect((filtered.body as { total: number }).total).toBe(flat.length);
  });

  it('paginates catalog including zero-stock products', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Katalog paged' },
    });
    expect(kitchenRes.status).toBe(201);
    const kitchen = kitchenRes.body as { id: string };

    for (let i = 0; i < 5; i++) {
      const product = await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/products`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: {
            name: `Katalog SKU ${Date.now()}-${i}`,
            defaultUnit: 'gram',
          },
        },
      );
      expect(product.status).toBe(201);
      if (i < 2) {
        const productId = (product.body as { id: string }).id;
        await apiFetch(api.origin, `/api/kitchens/${kitchen.id}/stock-items`, {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: {
            productId,
            quantity: '50.000',
            location: 'fridge',
          },
        });
      }
    }

    const catalog = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/catalog?page=1&limit=2&sort=name`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(catalog.status).toBe(200);
    const body = catalog.body as {
      items: unknown[];
      total: number;
      page: number;
      limit: number;
      pageCount: number;
    };
    expect(body.limit).toBe(2);
    expect(body.items.length).toBe(2);
    expect(body.total).toBeGreaterThanOrEqual(5);

    const withStock = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/catalog?hasStock=true&limit=100`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(withStock.status).toBe(200);
    expect((withStock.body as { total: number }).total).toBeGreaterThanOrEqual(
      2,
    );
  });
});
