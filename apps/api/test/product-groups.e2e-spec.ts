import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
  type TestUser,
} from './create-api-app';
import { closeTestPool } from './pg-client';

jest.setTimeout(90_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';

describe('Product groups (e2e)', () => {
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

  async function intake(
    user: TestUser,
    kitchenId: string,
    body: Record<string, unknown>,
  ) {
    const res = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: user.cookies,
        body,
      },
    );
    return res;
  }

  it('groups two mozzarella variants with separate nutrition and stock batches', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Mozzarella grupa');

    const first = await intake(owner, kitchen.id, {
      idempotencyKey: `moz-1-${crypto.randomUUID()}`,
      newProduct: {
        name: 'Mozzarella Galbani kulka',
        defaultUnit: 'gram',
        ean: '5901111000001',
        brand: 'Galbani',
        variantLabel: 'kulka',
        packageQuantity: '125.000',
        packageUnit: 'gram',
        createGroupName: 'Mozzarella',
      },
      nutrition: {
        baseQuantity: '100.000',
        baseUnit: 'gram',
        kcal: '280.000',
        proteinGrams: '18.000',
        carbsGrams: '1.000',
        fatGrams: '22.000',
        source: 'manual',
      },
      stock: {
        packageCount: '2',
        location: 'fridge',
        purchasePriceMinor: 599,
        storeName: 'Lidl',
      },
    });
    expect(first.status).toBe(201);
    const firstBody = first.body as {
      product: {
        id: string;
        groupId: string | null;
        brand: string | null;
        packageQuantity: string | null;
      };
      stockItem: { quantity: string; storeName: string | null } | null;
    };
    expect(firstBody.product.groupId).toBeTruthy();
    expect(firstBody.product.brand).toBe('Galbani');
    expect(firstBody.stockItem?.quantity).toBe('250.000');
    expect(firstBody.stockItem?.storeName).toBe('Lidl');
    const groupId = firstBody.product.groupId!;

    const second = await intake(owner, kitchen.id, {
      idempotencyKey: `moz-2-${crypto.randomUUID()}`,
      newProduct: {
        name: 'Mozzarella Light mini',
        defaultUnit: 'gram',
        ean: '5901111000002',
        brand: 'Hochland',
        variantLabel: 'mini light',
        packageQuantity: '100.000',
        packageUnit: 'gram',
        groupId,
      },
      nutrition: {
        baseQuantity: '100.000',
        baseUnit: 'gram',
        kcal: '180.000',
        proteinGrams: '20.000',
        carbsGrams: '1.500',
        fatGrams: '10.000',
        source: 'manual',
      },
      stock: {
        quantity: '100.000',
        location: 'fridge',
        purchasePriceMinor: 449,
        storeName: 'Biedronka',
      },
    });
    expect(second.status).toBe(201);
    const secondBody = second.body as {
      product: { id: string; groupId: string | null };
      stockItem: { quantity: string; storeName: string | null } | null;
    };
    expect(secondBody.product.groupId).toBe(groupId);
    expect(secondBody.stockItem?.storeName).toBe('Biedronka');
    expect(secondBody.product.id).not.toBe(firstBody.product.id);

    const sameEan = await intake(owner, kitchen.id, {
      idempotencyKey: `moz-dup-ean-${crypto.randomUUID()}`,
      newProduct: {
        name: 'Mozzarella Galbani duplikat',
        defaultUnit: 'gram',
        ean: '5901111000001',
        groupId,
      },
    });
    expect(sameEan.status).toBe(409);

    const existingBatch = await intake(owner, kitchen.id, {
      idempotencyKey: `moz-existing-${crypto.randomUUID()}`,
      existingProductId: firstBody.product.id,
      stock: {
        packageCount: '1',
        location: 'fridge',
        purchasePriceMinor: 320,
        storeName: 'Auchan',
      },
    });
    expect(existingBatch.status).toBe(201);

    const groupDetail = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-groups/${groupId}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(groupDetail.status).toBe(200);
    const detail = groupDetail.body as {
      products: Array<{ id: string; nutrition: { kcal: string } | null }>;
      summary: {
        productCount: number;
        batchCount: number;
        stockByUnit: Array<{ unit: string; totalQuantity: string }>;
        hasNutritionCount: number;
      };
    };
    expect(detail.products).toHaveLength(2);
    expect(detail.summary.productCount).toBe(2);
    expect(detail.summary.batchCount).toBe(3);
    expect(detail.summary.hasNutritionCount).toBe(2);
    expect(detail.products[0]!.nutrition?.kcal).not.toBe(
      detail.products[1]!.nutrition?.kcal,
    );
    const gramStock = detail.summary.stockByUnit.find(
      (row) => row.unit === 'gram',
    );
    expect(gramStock?.totalQuantity).toBe('475.000');

    const catalog = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/catalog`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(catalog.status).toBe(200);
    const catalogBody = catalog.body as {
      groups: Array<{ id: string; batchCount: number }>;
      ungroupedProducts: unknown[];
    };
    expect(catalogBody.groups.some((g) => g.id === groupId)).toBe(true);
    expect(catalogBody.groups.find((g) => g.id === groupId)?.batchCount).toBe(
      3,
    );

    const recipe = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          name: 'Sałatka z mozzarellą',
          description: 'Test',
          servings: 2,
          prepTimeMinutes: 5,
          cookTimeMinutes: 5,
          difficulty: 'easy',
          tags: ['test'],
          visibility: 'private',
          ingredients: [
            {
              name: 'Mozzarella Galbani',
              quantity: '125.000',
              unit: 'gram',
              sortOrder: 0,
              productId: firstBody.product.id,
            },
          ],
          steps: [{ instruction: 'Pokrój', sortOrder: 0 }],
        },
      },
    );
    expect(recipe.status).toBe(201);
    const recipeBody = recipe.body as {
      ingredients: Array<{ productId: string | null }>;
    };
    expect(recipeBody.ingredients[0]?.productId).toBe(firstBody.product.id);
  });

  it('keeps products after group delete and supports move between groups', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Przenoszenie grup');

    const groupA = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-groups`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Ser A' },
      },
    );
    expect(groupA.status).toBe(201);
    const groupAId = (groupA.body as { id: string }).id;

    const groupB = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-groups`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Ser B' },
      },
    );
    const groupBId = (groupB.body as { id: string }).id;

    const created = await intake(owner, kitchen.id, {
      idempotencyKey: `move-${crypto.randomUUID()}`,
      newProduct: {
        name: 'Ser do przeniesienia',
        defaultUnit: 'gram',
        groupId: groupAId,
      },
    });
    const productId = (created.body as { product: { id: string } }).product.id;

    const moved = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${productId}/assign-group`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { groupId: groupBId },
      },
    );
    expect(moved.status).toBe(201);
    expect((moved.body as { groupId: string }).groupId).toBe(groupBId);

    const deleted = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-groups/${groupBId}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(deleted.status).toBe(200);

    const products = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const list = products.body as Array<{ id: string; groupId: string | null }>;
    const product = list.find((item) => item.id === productId);
    expect(product).toBeDefined();
    expect(product?.groupId).toBeNull();
  });

  it('aggregates compatible units separately and searches by brand/variant/ean', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Agregacja jednostek');

    const group = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-groups`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Nabiał mieszany' },
      },
    );
    const groupId = (group.body as { id: string }).id;

    await intake(owner, kitchen.id, {
      idempotencyKey: `agg-g-${crypto.randomUUID()}`,
      newProduct: {
        name: 'Jogurt gramowy',
        defaultUnit: 'gram',
        brand: 'Activia',
        variantLabel: 'naturalny',
        ean: '5902222000001',
        groupId,
      },
      stock: { quantity: '500.000', location: 'fridge' },
    });
    await intake(owner, kitchen.id, {
      idempotencyKey: `agg-ml-${crypto.randomUUID()}`,
      newProduct: {
        name: 'Mleko mililitrowe',
        defaultUnit: 'milliliter',
        brand: 'Łaciate',
        variantLabel: '3.2%',
        ean: '5902222000002',
        groupId,
      },
      stock: { quantity: '1000.000', location: 'fridge' },
    });

    const summary = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-groups/${groupId}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const body = summary.body as {
      summary: {
        stockByUnit: Array<{ unit: string; totalQuantity: string }>;
        batchCount: number;
      };
    };
    expect(body.summary.batchCount).toBe(2);
    expect(body.summary.stockByUnit).toEqual(
      expect.arrayContaining([
        { unit: 'gram', totalQuantity: '500.000' },
        { unit: 'milliliter', totalQuantity: '1000.000' },
      ]),
    );
    expect(body.summary.stockByUnit).toHaveLength(2);

    const byBrand = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-groups?search=Activia`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(
      (byBrand.body as Array<{ id: string }>).some((g) => g.id === groupId),
    ).toBe(true);

    const byVariant = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-groups?search=${encodeURIComponent('3.2%')}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(
      (byVariant.body as Array<{ id: string }>).some((g) => g.id === groupId),
    ).toBe(true);

    const byEan = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/product-groups?search=5902222000002`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(
      (byEan.body as Array<{ id: string }>).some((g) => g.id === groupId),
    ).toBe(true);

    const match = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/match?name=Nabiał`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(match.status).toBe(200);
    const matchBody = match.body as {
      suggestedGroups: Array<{ id: string; name: string }>;
    };
    expect(matchBody.suggestedGroups.some((g) => g.id === groupId)).toBe(true);
  });

  it('isolates groups between kitchens and replays idempotent intake', async () => {
    const ownerA = await signUpUser(api.origin, WEB_ORIGIN);
    const ownerB = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenA = await createKitchen(ownerA, 'Kuchnia A');
    const kitchenB = await createKitchen(ownerB, 'Kuchnia B');

    const groupA = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/product-groups`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: { name: 'Wspólna nazwa' },
      },
    );
    const groupAId = (groupA.body as { id: string }).id;

    const foreign = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenB.id}/product-groups/${groupAId}`,
      { webOrigin: WEB_ORIGIN, cookies: ownerB.cookies },
    );
    expect(foreign.status).toBe(404);

    const key = `idem-group-${crypto.randomUUID()}`;
    const payload = {
      idempotencyKey: key,
      newProduct: {
        name: 'Produkt idempotentny',
        defaultUnit: 'gram',
        createGroupName: 'Grupa idem',
        packageQuantity: '250.000',
        packageUnit: 'gram',
      },
      stock: {
        packageCount: '2',
        location: 'pantry',
      },
    };
    const first = await intake(ownerA, kitchenA.id, payload);
    expect(first.status).toBe(201);
    const firstBody = first.body as {
      product: { id: string };
      stockItem: { id: string; quantity: string } | null;
      replayed: boolean;
    };
    expect(firstBody.replayed).toBe(false);
    expect(firstBody.stockItem?.quantity).toBe('500.000');

    const replay = await intake(ownerA, kitchenA.id, payload);
    expect(replay.status).toBe(201);
    const replayBody = replay.body as {
      product: { id: string };
      stockItem: { id: string } | null;
      replayed: boolean;
    };
    expect(replayBody.replayed).toBe(true);
    expect(replayBody.product.id).toBe(firstBody.product.id);
    expect(replayBody.stockItem?.id).toBe(firstBody.stockItem?.id);
  });

  it('rejects unsafe packageCount conversion', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Unsafe package');

    const res = await intake(owner, kitchen.id, {
      idempotencyKey: `unsafe-${crypto.randomUUID()}`,
      newProduct: {
        name: 'Olej',
        defaultUnit: 'milliliter',
        packageQuantity: '500.000',
        packageUnit: 'gram',
      },
      stock: {
        packageCount: '1',
        location: 'pantry',
      },
    });
    expect(res.status).toBe(400);
  });
});
