import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
  type TestUser,
} from './create-api-app';
import { closeTestPool } from './pg-client';

jest.setTimeout(60_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';

describe('Product intake (e2e)', () => {
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

  async function createKitchen(
    user: TestUser,
    name: string,
  ): Promise<{ id: string }> {
    const res = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: user.cookies,
      body: { name },
    });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  it('creates product and stock atomically', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Intake atomowy');
    const key = `intake-atomic-${crypto.randomUUID()}`;

    const res = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: key,
          newProduct: {
            name: 'Jogurt naturalny',
            defaultUnit: 'gram',
            ean: '5901234123401',
            category: 'Nabiał',
          },
          stock: {
            quantity: '450.000',
            location: 'fridge',
            purchasePriceMinor: 299,
            storeName: 'Lidl',
          },
        },
      },
    );
    expect(res.status).toBe(201);
    const body = res.body as {
      product: { id: string; name: string; ean: string | null };
      stockItem: {
        id: string;
        quantity: string;
        storeName: string | null;
        purchasePriceMinor: number | null;
      } | null;
      replayed: boolean;
      restoredFromArchive: boolean;
    };
    expect(body.replayed).toBe(false);
    expect(body.restoredFromArchive).toBe(false);
    expect(body.product.name).toBe('Jogurt naturalny');
    expect(body.product.ean).toBe('5901234123401');
    expect(body.stockItem).not.toBeNull();
    expect(body.stockItem?.quantity).toBe('450.000');
    expect(body.stockItem?.storeName).toBe('Lidl');
    expect(body.stockItem?.purchasePriceMinor).toBe(299);

    const stockList = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-items?productId=${body.product.id}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(stockList.status).toBe(200);
    expect((stockList.body as unknown[]).length).toBe(1);
  });

  it('creates product without stock', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Intake bez zapasu');

    const res = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `intake-nostock-${crypto.randomUUID()}`,
          newProduct: {
            name: 'Sól',
            defaultUnit: 'gram',
          },
        },
      },
    );
    expect(res.status).toBe(201);
    const body = res.body as {
      product: { id: string };
      stockItem: unknown;
    };
    expect(body.stockItem).toBeNull();

    const stockList = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-items?productId=${body.product.id}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect((stockList.body as unknown[]).length).toBe(0);
  });

  it('replays identical intake by idempotency key', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Intake idempotentny');
    const key = `intake-replay-${crypto.randomUUID()}`;
    const payload = {
      idempotencyKey: key,
      newProduct: {
        name: 'Kefir',
        defaultUnit: 'milliliter',
      },
      stock: {
        quantity: '1000.000',
        location: 'fridge',
      },
    };

    const first = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: payload,
      },
    );
    expect(first.status).toBe(201);
    const firstBody = first.body as {
      product: { id: string };
      stockItem: { id: string } | null;
      replayed: boolean;
    };
    expect(firstBody.replayed).toBe(false);

    const second = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: payload,
      },
    );
    expect(second.status).toBe(201);
    const secondBody = second.body as {
      product: { id: string };
      stockItem: { id: string } | null;
      replayed: boolean;
    };
    expect(secondBody.replayed).toBe(true);
    expect(secondBody.product.id).toBe(firstBody.product.id);
    expect(secondBody.stockItem?.id).toBe(firstBody.stockItem?.id);

    const products = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const kefirs = (products.body as Array<{ normalizedName: string }>).filter(
      (p) => p.normalizedName === 'kefir',
    );
    expect(kefirs.length).toBe(1);
  });

  it('adds stock to existing product matched by EAN', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Intake existing EAN');
    const ean = '5901234123402';

    const created = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          name: 'Mleko UHT',
          defaultUnit: 'milliliter',
          ean,
        },
      },
    );
    expect(created.status).toBe(201);
    const product = created.body as { id: string };

    const match = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/match?ean=${ean}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(match.status).toBe(200);
    const matchBody = match.body as {
      exactEan: { id: string } | null;
      message: string | null;
    };
    expect(matchBody.exactEan?.id).toBe(product.id);
    expect(matchBody.message).toContain('już w katalogu');

    const intake = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `intake-existing-${crypto.randomUUID()}`,
          existingProductId: product.id,
          stock: {
            quantity: '500.000',
            location: 'pantry',
            storeName: 'Biedronka',
          },
        },
      },
    );
    expect(intake.status).toBe(201);
    const body = intake.body as {
      product: { id: string };
      stockItem: { storeName: string | null } | null;
      restoredFromArchive: boolean;
    };
    expect(body.product.id).toBe(product.id);
    expect(body.restoredFromArchive).toBe(false);
    expect(body.stockItem?.storeName).toBe('Biedronka');
  });

  it('restores archived product when restoreArchived=true', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Intake restore');

    const created = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Masło', defaultUnit: 'gram' },
      },
    );
    const product = created.body as { id: string };

    const archived = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(archived.status).toBe(200);

    const withoutFlag = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `intake-archived-deny-${crypto.randomUUID()}`,
          existingProductId: product.id,
          stock: { quantity: '200.000', location: 'fridge' },
        },
      },
    );
    expect(withoutFlag.status).toBe(409);

    const withFlag = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `intake-archived-ok-${crypto.randomUUID()}`,
          existingProductId: product.id,
          restoreArchived: true,
          stock: { quantity: '200.000', location: 'fridge' },
        },
      },
    );
    expect(withFlag.status).toBe(201);
    const body = withFlag.body as {
      restoredFromArchive: boolean;
      product: { isArchived: boolean; archivedAt: string | null };
    };
    expect(body.restoredFromArchive).toBe(true);
    expect(body.product.isArchived).toBe(false);
    expect(body.product.archivedAt).toBeNull();
  });

  it('rejects negative nutrition in the same transaction', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Intake nutrition reject');

    const res = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `intake-neg-nut-${crypto.randomUUID()}`,
          newProduct: {
            name: 'Ser żółty',
            defaultUnit: 'gram',
          },
          nutrition: {
            baseQuantity: '100.000',
            baseUnit: 'gram',
            kcal: '-10.000',
            proteinGrams: '25.000',
            carbsGrams: '0.000',
            fatGrams: '30.000',
          },
        },
      },
    );
    expect(res.status).toBe(400);

    const products = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const names = (products.body as Array<{ normalizedName: string }>).map(
      (p) => p.normalizedName,
    );
    expect(names).not.toContain('ser żółty');
  });

  it('isolates idempotency keys and media across kitchens', async () => {
    const ownerA = await signUpUser(api.origin, WEB_ORIGIN);
    const ownerB = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenA = await createKitchen(ownerA, 'Kitchen A intake');
    const kitchenB = await createKitchen(ownerB, 'Kitchen B intake');
    const sharedKey = `intake-shared-${crypto.randomUUID()}`;

    const first = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: {
          idempotencyKey: sharedKey,
          newProduct: { name: 'Chleb', defaultUnit: 'gram' },
        },
      },
    );
    expect(first.status).toBe(201);

    const conflict = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenB.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerB.cookies,
        body: {
          idempotencyKey: sharedKey,
          newProduct: { name: 'Chleb B', defaultUnit: 'gram' },
        },
      },
    );
    expect(conflict.status).toBe(409);

    const foreignMedia = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: {
          idempotencyKey: `intake-bad-media-${crypto.randomUUID()}`,
          newProduct: {
            name: 'Bułka',
            defaultUnit: 'piece',
            imageMediaId: crypto.randomUUID(),
          },
        },
      },
    );
    expect(foreignMedia.status).toBe(400);

    const foreignKitchen = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerB.cookies,
        body: {
          idempotencyKey: `intake-foreign-${crypto.randomUUID()}`,
          newProduct: { name: 'Obcy', defaultUnit: 'gram' },
        },
      },
    );
    expect(foreignKitchen.status).toBe(404);
  });

  it('deletes product nutrition', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Delete nutrition');

    const created = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Twaróg', defaultUnit: 'gram' },
      },
    );
    const product = created.body as { id: string };

    const put = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/nutrition`,
      {
        method: 'PUT',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          baseQuantity: '100.000',
          baseUnit: 'gram',
          kcal: '100.000',
          proteinGrams: '10.000',
          carbsGrams: '5.000',
          fatGrams: '4.000',
        },
      },
    );
    expect(put.status).toBe(200);

    const deleted = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/nutrition`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ deleted: true });

    const get = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/nutrition`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(get.status).toBe(200);
    expect(get.body).toBeNull();
  });
});
