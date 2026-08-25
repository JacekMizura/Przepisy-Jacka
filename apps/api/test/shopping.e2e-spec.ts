import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
} from './create-api-app';
import { closeTestPool, queryTestDb } from './pg-client';

jest.setTimeout(60_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';

describe('Shopping list and purchases (e2e)', () => {
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

  it('manages shopping list items with access control and merge rules', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const outsider = await signUpUser(api.origin, WEB_ORIGIN);

    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Zakupy' },
    });
    const kitchen = kitchenRes.body as { id: string };

    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Mleko', defaultUnit: 'milliliter' },
      },
    );
    const product = productRes.body as { id: string };

    const missingCustomName = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {},
      },
    );
    expect(missingCustomName.status).toBe(400);

    const customItemRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          customName: 'Papryka',
          plannedQuantity: '2.000',
          plannedUnit: 'piece',
          note: 'czerwona',
        },
      },
    );
    expect(customItemRes.status).toBe(201);
    const customItem = customItemRes.body as {
      id: string;
      customName: string;
      product: null;
      status: string;
    };
    expect(customItem.customName).toBe('Papryka');
    expect(customItem.product).toBeNull();
    expect(customItem.status).toBe('pending');

    const productItemRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: product.id,
          plannedQuantity: '1.000',
          plannedUnit: 'liter',
        },
      },
    );
    expect(productItemRes.status).toBe(201);
    const productItem = productItemRes.body as {
      id: string;
      productId: string;
      product: { name: string; defaultUnit: string };
    };
    expect(productItem.productId).toBe(product.id);
    expect(productItem.product.name).toBe('Mleko');

    const duplicate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: product.id,
          plannedQuantity: '0.500',
          plannedUnit: 'liter',
        },
      },
    );
    expect(duplicate.status).toBe(409);

    const merged = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: product.id,
          plannedQuantity: '0.500',
          plannedUnit: 'liter',
          mergeQuantity: true,
        },
      },
    );
    expect(merged.status).toBe(201);
    const mergedItem = merged.body as {
      id: string;
      plannedQuantity: string;
    };
    expect(mergedItem.id).toBe(productItem.id);
    expect(mergedItem.plannedQuantity).toBe('1.500');

    const listed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body)).toBe(true);
    expect((listed.body as unknown[]).length).toBe(2);

    const foreignRead = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: outsider.cookies,
      },
    );
    expect(foreignRead.status).toBe(404);

    const updated = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items/${customItem.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          customName: 'Papryka słodka',
          plannedQuantity: '3.000',
          plannedUnit: 'piece',
          note: null,
        },
      },
    );
    expect(updated.status).toBe(200);
    const updatedBody = updated.body as {
      customName: string;
      plannedQuantity: string;
      note: string | null;
    };
    expect(updatedBody.customName).toBe('Papryka słodka');
    expect(updatedBody.plannedQuantity).toBe('3.000');
    expect(updatedBody.note).toBeNull();

    const skipped = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items/${customItem.id}/status`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { status: 'skipped' },
      },
    );
    expect(skipped.status).toBe(200);
    expect((skipped.body as { status: string }).status).toBe('skipped');

    const deleted = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items/${customItem.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(deleted.status).toBe(200);

    const afterDelete = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect((afterDelete.body as unknown[]).length).toBe(1);
  });

  it('checks out bought items idempotently and creates stock', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);

    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Checkout' },
    });
    const kitchen = kitchenRes.body as { id: string };

    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Jogurt', defaultUnit: 'gram' },
      },
    );
    const yogurtProduct = productRes.body as { id: string };

    const yogurtItemRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: yogurtProduct.id,
          plannedQuantity: '400.000',
          plannedUnit: 'gram',
        },
      },
    );
    const yogurtItem = yogurtItemRes.body as { id: string };

    const customItemRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { customName: 'Awokado' },
      },
    );
    const customItem = customItemRes.body as { id: string };

    const markYogurt = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items/${yogurtItem.id}/status`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { status: 'bought' },
      },
    );
    expect(markYogurt.status).toBe(200);

    const markCustom = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items/${customItem.id}/status`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { status: 'bought' },
      },
    );
    expect(markCustom.status).toBe(200);

    const pendingOnly = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { customName: 'Pending line' },
      },
    );
    const pendingItem = pendingOnly.body as { id: string };

    const rejectKey = `reject-not-bought-${crypto.randomUUID()}`;
    const rejectPendingCheckout = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases/checkout`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: rejectKey,
          lines: [
            {
              shoppingListItemId: pendingItem.id,
              quantity: '1.000',
              inputUnit: 'piece',
              location: 'pantry',
              priceMinor: 100,
              createProduct: { name: 'Pending line', defaultUnit: 'piece' },
            },
          ],
        },
      },
    );
    expect(rejectPendingCheckout.status).toBe(400);

    const checkoutIdempotencyKey = `checkout-key-${crypto.randomUUID()}`;
    const checkoutBody = {
      idempotencyKey: checkoutIdempotencyKey,
      storeName: 'Lidl',
      currency: 'PLN',
      lines: [
        {
          shoppingListItemId: yogurtItem.id,
          quantity: '400.000',
          inputUnit: 'gram',
          location: 'fridge',
          priceMinor: 499,
          productId: yogurtProduct.id,
        },
        {
          shoppingListItemId: customItem.id,
          quantity: '2.000',
          inputUnit: 'piece',
          location: 'pantry',
          priceMinor: 1200,
          createProduct: { name: 'Awokado', defaultUnit: 'piece' },
        },
      ],
    };

    const checkout = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases/checkout`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: checkoutBody,
      },
    );
    expect(checkout.status).toBe(201);
    const purchase = checkout.body as {
      id: string;
      storeName: string | null;
      totalPriceMinor: number;
      itemCount: number;
      lines: Array<{
        stockItemId: string | null;
        quantity: string;
        shoppingListItemId: string | null;
      }>;
    };
    expect(purchase.storeName).toBe('Lidl');
    expect(purchase.totalPriceMinor).toBe(1699);
    expect(purchase.itemCount).toBe(2);
    expect(purchase.lines).toHaveLength(2);
    expect(purchase.lines[0]?.stockItemId).toBeTruthy();

    const stockCountAfterFirst = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "StockItem" WHERE "productId" IN ($1, (SELECT id FROM "Product" WHERE "kitchenId" = $2 AND "normalizedName" = $3))',
      [yogurtProduct.id, kitchen.id, 'awokado'],
    );
    expect(Number(stockCountAfterFirst[0]?.count)).toBe(2);

    const duplicateCheckout = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases/checkout`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: checkoutBody,
      },
    );
    expect(duplicateCheckout.status).toBe(201);
    expect((duplicateCheckout.body as { id: string }).id).toBe(purchase.id);

    const stockCountAfterSecond = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "StockItem" WHERE "productId" IN ($1, (SELECT id FROM "Product" WHERE "kitchenId" = $2 AND "normalizedName" = $3))',
      [yogurtProduct.id, kitchen.id, 'awokado'],
    );
    expect(Number(stockCountAfterSecond[0]?.count)).toBe(2);

    const resolvedItems = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect((resolvedItems.body as unknown[]).length).toBe(1);

    const listPurchases = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(listPurchases.status).toBe(200);
    const summaries = listPurchases.body as Array<{
      id: string;
      itemCount: number;
      totalPriceMinor: number;
    }>;
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.itemCount).toBe(2);
    expect(summaries[0]?.totalPriceMinor).toBe(1699);

    const detail = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases/${purchase.id}`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(detail.status).toBe(200);
    expect((detail.body as { lines: unknown[] }).lines).toHaveLength(2);

    const blockedUpdate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items/${yogurtItem.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { note: 'za późno' },
      },
    );
    expect(blockedUpdate.status).toBe(400);

    const blockedDelete = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items/${yogurtItem.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(blockedDelete.status).toBe(400);

    const alreadyResolvedCheckout = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases/checkout`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `checkout-key-${crypto.randomUUID()}`,
          lines: [
            {
              shoppingListItemId: yogurtItem.id,
              quantity: '100.000',
              inputUnit: 'gram',
              location: 'fridge',
              priceMinor: 100,
              productId: yogurtProduct.id,
            },
          ],
        },
      },
    );
    expect(alreadyResolvedCheckout.status).toBe(400);
  });

  it('handles concurrent add without merge as one success and one conflict', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);

    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Concurrent no merge' },
    });
    const kitchen = kitchenRes.body as { id: string };

    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Masło', defaultUnit: 'gram' },
      },
    );
    const product = productRes.body as { id: string };

    const body = {
      productId: product.id,
      plannedQuantity: '200.000',
      plannedUnit: 'gram',
    };

    const [first, second] = await Promise.all([
      apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/shopping-list/items`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body,
        },
      ),
      apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/shopping-list/items`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body,
        },
      ),
    ]);

    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);

    const listed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(listed.status).toBe(200);
    expect((listed.body as unknown[]).length).toBe(1);
  });

  it('handles concurrent add with merge as one item with summed quantity', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);

    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Concurrent merge' },
    });
    const kitchen = kitchenRes.body as { id: string };

    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Sok', defaultUnit: 'milliliter' },
      },
    );
    const product = productRes.body as { id: string };

    const [first, second] = await Promise.all([
      apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/shopping-list/items`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: {
            productId: product.id,
            plannedQuantity: '1.000',
            plannedUnit: 'liter',
            mergeQuantity: true,
          },
        },
      ),
      apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/shopping-list/items`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: {
            productId: product.id,
            plannedQuantity: '0.500',
            plannedUnit: 'liter',
            mergeQuantity: true,
          },
        },
      ),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const listed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(listed.status).toBe(200);
    const items = listed.body as Array<{ plannedQuantity: string }>;
    expect(items).toHaveLength(1);
    expect(items[0]?.plannedQuantity).toBe('1.500');
  });
});
