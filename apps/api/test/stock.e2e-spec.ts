import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
} from './create-api-app';
import { closeTestPool, queryTestDb } from './pg-client';

jest.setTimeout(60_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';

describe('Products and stock (e2e)', () => {
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

  it('isolates catalog data and rejects invalid quantities, prices and units', async () => {
    const ownerA = await signUpUser(api.origin, WEB_ORIGIN);
    const ownerB = await signUpUser(api.origin, WEB_ORIGIN);

    const kitchenARes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: ownerA.cookies,
      body: { name: 'Kuchnia A' },
    });
    const kitchenBRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: ownerB.cookies,
      body: { name: 'Kuchnia B' },
    });
    const kitchenA = kitchenARes.body as { id: string };
    const kitchenB = kitchenBRes.body as { id: string };

    const milk = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: {
          name: 'Mleko',
          defaultUnit: 'milliliter',
          ean: '5901234123457',
          category: 'Nabiał',
          imageUrl: 'https://example.com/mleko.jpg',
        },
      },
    );
    expect(milk.status).toBe(201);
    const product = milk.body as {
      id: string;
      ean: string | null;
      category: string | null;
      imageUrl: string | null;
    };
    expect(product.ean).toBe('5901234123457');
    expect(product.category).toBe('Nabiał');
    expect(product.imageUrl).toBe('https://example.com/mleko.jpg');

    const duplicateEan = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: {
          name: 'Mleko 2',
          defaultUnit: 'milliliter',
          ean: '5901234123457',
        },
      },
    );
    expect(duplicateEan.status).toBe(409);

    const duplicate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: { name: '  mleko  ', defaultUnit: 'milliliter' },
      },
    );
    expect(duplicate.status).toBe(409);

    const foreignRead = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/products`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: ownerB.cookies,
      },
    );
    expect(foreignRead.status).toBe(404);

    const foreignCreate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/stock-items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerB.cookies,
        body: {
          productId: product.id,
          quantity: '500.000',
          location: 'fridge',
          purchasePriceMinor: 499,
        },
      },
    );
    expect(foreignCreate.status).toBe(404);

    const negativePrice = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/stock-items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: {
          productId: product.id,
          quantity: '500.000',
          location: 'fridge',
          purchasePriceMinor: -1,
        },
      },
    );
    expect(negativePrice.status).toBe(400);

    const negativeQty = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/stock-items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: {
          productId: product.id,
          quantity: '-1',
          location: 'fridge',
          purchasePriceMinor: 100,
        },
      },
    );
    expect(negativeQty.status).toBe(400);

    const badPrecision = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/stock-items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: {
          productId: product.id,
          quantity: '1.2345',
          location: 'fridge',
          purchasePriceMinor: 100,
        },
      },
    );
    expect(badPrecision.status).toBe(400);

    const badUnit = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/stock-items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: {
          productId: product.id,
          quantity: '500.000',
          location: 'fridge',
          purchasePriceMinor: 100,
          unit: 'kilogram',
        },
      },
    );
    expect(badUnit.status).toBe(400);

    const created = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/stock-items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: {
          productId: product.id,
          quantity: '500.000',
          location: 'fridge',
          purchasePriceMinor: 599,
          currency: 'PLN',
        },
      },
    );
    expect(created.status).toBe(201);
    const item = created.body as {
      id: string;
      initialQuantity: string;
      quantity: string;
      purchasePriceMinor: number;
    };
    expect(item.initialQuantity).toBe('500.000');
    expect(item.quantity).toBe('500.000');
    expect(item.purchasePriceMinor).toBe(599);

    const tooMuch = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/stock-items/${item.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: { quantity: '500.001' },
      },
    );
    expect(tooMuch.status).toBe(400);

    const updated = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/stock-items/${item.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: { quantity: '200.000', location: 'freezer' },
      },
    );
    expect(updated.status).toBe(200);
    const updatedBody = updated.body as {
      quantity: string;
      initialQuantity: string;
      purchasePriceMinor: number;
      location: string;
    };
    expect(updatedBody.quantity).toBe('200.000');
    expect(updatedBody.initialQuantity).toBe('500.000');
    expect(updatedBody.purchasePriceMinor).toBe(599);
    expect(updatedBody.location).toBe('freezer');

    const listedB = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenB.id}/stock-items`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: ownerB.cookies,
      },
    );
    expect(listedB.status).toBe(200);
    expect(listedB.body).toEqual([]);

    const deleted = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/stock-items/${item.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
      },
    );
    expect(deleted.status).toBe(200);
  });

  it('requires explicit confirmation before cascading product deletion', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Kaskada' },
    });
    const kitchen = kitchenRes.body as { id: string };
    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Kuskus', defaultUnit: 'gram' },
      },
    );
    const product = productRes.body as { id: string };
    const stockRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: product.id,
          quantity: '500.000',
          location: 'pantry',
          purchasePriceMinor: 800,
        },
      },
    );
    const stock = stockRes.body as { id: string };

    const blocked = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(blocked.status).toBe(409);
    const remainingBefore = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "StockItem" WHERE id = $1',
      [stock.id],
    );
    expect(Number(remainingBefore[0]?.count)).toBe(1);

    const confirmed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}?confirmCascade=true`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(confirmed.status).toBe(200);
    const remainingStock = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "StockItem" WHERE id = $1',
      [stock.id],
    );
    const remainingProduct = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "Product" WHERE id = $1',
      [product.id],
    );
    expect(Number(remainingStock[0]?.count)).toBe(0);
    expect(Number(remainingProduct[0]?.count)).toBe(0);
  });
});
