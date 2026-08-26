import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
  type TestUser,
} from './create-api-app';
import { closeTestPool, queryTestDb } from './pg-client';

jest.setTimeout(120_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';

describe('Purchase options and recipe shopping (e2e)', () => {
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

  async function createKitchen(user: TestUser, name: string) {
    const response = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: user.cookies,
      body: { name },
    });
    expect(response.status).toBe(201);
    return response.body as { id: string };
  }

  async function createProduct(
    user: TestUser,
    kitchenId: string,
    body: { name: string; defaultUnit: string },
  ) {
    const response = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: user.cookies,
        body,
      },
    );
    expect(response.status).toBe(201);
    return response.body as { id: string; defaultUnit: string };
  }

  async function createPurchaseOption(
    user: TestUser,
    kitchenId: string,
    productId: string,
    body: Record<string, unknown>,
  ) {
    const response = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/purchase-options`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: user.cookies,
        body,
      },
    );
    return response;
  }

  it('proposes 1×1l carton for 100 ml gap and stores plannedQuantity 1000', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Karton mleka');

    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko',
      defaultUnit: 'milliliter',
    });

    const optionRes = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Karton 1 l',
      contentQuantity: '1000.000',
      contentUnit: 'milliliter',
      isDefault: true,
    });
    expect(optionRes.status).toBe(201);

    const recipeRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          name: 'Kawa',
          servings: 1,
          difficulty: 'easy',
          ingredients: [
            {
              name: 'Mleko',
              quantity: '100.000',
              unit: 'milliliter',
              productId: milk.id,
              sortOrder: 0,
            },
          ],
          steps: [{ instruction: 'Zalej mlekiem.', sortOrder: 0 }],
        },
      },
    );
    expect(recipeRes.status).toBe(201);
    const recipe = recipeRes.body as { id: string };

    const availability = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/availability?servings=1`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(availability.status).toBe(200);
    const milkAvailability = (
      availability.body as {
        ingredients: Array<{
          status: string;
          gapQuantity: string;
          purchaseProposal: {
            mode: string;
            packageCount: number;
            totalPurchaseQuantity: string;
          } | null;
        }>;
      }
    ).ingredients[0];
    expect(milkAvailability?.status).toBe('missing');
    expect(milkAvailability?.gapQuantity).toBe('100.000');
    expect(milkAvailability?.purchaseProposal?.mode).toBe('packages');
    expect(milkAvailability?.purchaseProposal?.packageCount).toBe(1);
    expect(milkAvailability?.purchaseProposal?.totalPurchaseQuantity).toBe(
      '1000.000',
    );

    const addGaps = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `gap-carton-${crypto.randomUUID()}`,
          servings: 1,
        },
      },
    );
    expect(addGaps.status).toBe(201);

    const list = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const item = (
      list.body as Array<{
        id: string;
        plannedQuantity: string;
        requiredQuantity: string;
        packageCount: number;
        purchaseOption: { name: string } | null;
      }>
    )[0];
    expect(item?.plannedQuantity).toBe('1000.000');
    expect(item?.requiredQuantity).toBe('100.000');
    expect(item?.packageCount).toBe(1);
    expect(item?.purchaseOption?.name).toBe('Karton 1 l');
    // UI formats this as "1 × Karton 1 l" via formatPackagePurchase

    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items/${item!.id}/status`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { status: 'bought' },
      },
    );

    const checkoutKey = `checkout-100ml-carton-${crypto.randomUUID()}`;
    const checkoutBody = {
      idempotencyKey: checkoutKey,
      lines: [
        {
          shoppingListItemId: item!.id,
          quantity: '100.000',
          inputUnit: 'milliliter',
          location: 'fridge',
          priceMinor: 499,
          productId: milk.id,
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
    const purchase = checkout.body as { id: string };

    const stockRows = await queryTestDb<{ quantity: string }>(
      `SELECT "quantity"::text AS quantity FROM "StockItem" WHERE "productId" = $1`,
      [milk.id],
    );
    expect(stockRows).toHaveLength(1);
    expect(stockRows[0]?.quantity).toBe('1000.000');

    const checkoutAgain = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases/checkout`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: checkoutBody,
      },
    );
    expect(checkoutAgain.status).toBe(201);
    expect((checkoutAgain.body as { id: string }).id).toBe(purchase.id);

    const stockCount = await queryTestDb<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "StockItem" WHERE "productId" = $1`,
      [milk.id],
    );
    expect(Number(stockCount[0]?.count)).toBe(1);
  });

  it('proposes two packages when gap exceeds one package', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Dwa kartony');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko 2',
      defaultUnit: 'milliliter',
    });
    await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Karton 1 l',
      contentQuantity: '1000.000',
      contentUnit: 'milliliter',
      isDefault: true,
    });

    const recipeRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          name: 'Dużo mleka',
          servings: 1,
          difficulty: 'easy',
          ingredients: [
            {
              name: 'Mleko',
              quantity: '1200.000',
              unit: 'milliliter',
              productId: milk.id,
              sortOrder: 0,
            },
          ],
          steps: [{ instruction: 'Gotuj.', sortOrder: 0 }],
        },
      },
    );
    const recipe = recipeRes.body as { id: string };

    const availability = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/availability?servings=1`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const proposal = (
      availability.body as {
        ingredients: Array<{
          purchaseProposal: {
            packageCount: number;
            totalPurchaseQuantity: string;
          };
        }>;
      }
    ).ingredients[0]?.purchaseProposal;
    expect(proposal?.packageCount).toBe(2);
    expect(proposal?.totalPurchaseQuantity).toBe('2000.000');
  });

  it('allows changing purchase variant via selections', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Wariant');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko wariant',
      defaultUnit: 'milliliter',
    });

    const carton = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Karton 1 l',
      contentQuantity: '1000.000',
      contentUnit: 'milliliter',
      isDefault: true,
    });
    const bottle = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Butelka 500 ml',
      contentQuantity: '500.000',
      contentUnit: 'milliliter',
    });
    const cartonId = (carton.body as { id: string }).id;
    const bottleId = (bottle.body as { id: string }).id;

    const recipeRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          name: 'Mało mleka',
          servings: 1,
          difficulty: 'easy',
          ingredients: [
            {
              name: 'Mleko',
              quantity: '100.000',
              unit: 'milliliter',
              productId: milk.id,
              sortOrder: 0,
            },
          ],
          steps: [{ instruction: 'Gotuj.', sortOrder: 0 }],
        },
      },
    );
    const recipe = recipeRes.body as {
      id: string;
      ingredients: Array<{ id: string }>;
    };

    const addGaps = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `gap-variant-${crypto.randomUUID()}`,
          servings: 1,
          selections: [
            {
              ingredientId: recipe.ingredients[0]!.id,
              purchaseOptionId: bottleId,
            },
          ],
        },
      },
    );
    expect(addGaps.status).toBe(201);

    const list = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const item = (
      list.body as Array<{
        plannedQuantity: string;
        purchaseOptionId: string;
      }>
    )[0];
    expect(item?.plannedQuantity).toBe('500.000');
    expect(item?.purchaseOptionId).toBe(bottleId);
    expect(item?.purchaseOptionId).not.toBe(cartonId);
  });

  it('returns unconfigured proposal when product has no purchase options', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Exact qty');
    const flour = await createProduct(owner, kitchen.id, {
      name: 'Mąka',
      defaultUnit: 'gram',
    });

    const recipeRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          name: 'Ciasto',
          servings: 1,
          difficulty: 'easy',
          ingredients: [
            {
              name: 'Mąka',
              quantity: '300.000',
              unit: 'gram',
              productId: flour.id,
              sortOrder: 0,
            },
          ],
          steps: [{ instruction: 'Wymieszaj.', sortOrder: 0 }],
        },
      },
    );
    const recipe = recipeRes.body as { id: string };

    const availability = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/availability?servings=1`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const proposal = (
      availability.body as {
        ingredients: Array<{
          purchaseProposal: {
            mode: string;
            totalPurchaseQuantity: string;
            purchaseOptionId: string | null;
          };
        }>;
      }
    ).ingredients[0]?.purchaseProposal;
    expect(proposal?.mode).toBe('unconfigured');
    expect(proposal?.totalPurchaseQuantity).toBe('300.000');
    expect(proposal?.purchaseOptionId).toBeNull();

    const addGaps = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `gap-exact-${crypto.randomUUID()}`,
          servings: 1,
        },
      },
    );
    expect(addGaps.status).toBe(400);
    expect(JSON.stringify(addGaps.body)).toContain(
      'Produkt wymaga konfiguracji sposobu zakupu.',
    );

    const list = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect((list.body as unknown[]).length).toBe(0);
  });

  it('checkout adds full package content to stock and is idempotent', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Checkout pakiet');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko checkout',
      defaultUnit: 'milliliter',
    });
    const optionRes = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Karton 1 l',
      contentQuantity: '1000.000',
      contentUnit: 'milliliter',
      isDefault: true,
    });
    const option = optionRes.body as { id: string };

    const itemRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: milk.id,
          plannedQuantity: '1000.000',
          plannedUnit: 'milliliter',
          requiredQuantity: '100.000',
          requiredUnit: 'milliliter',
          purchaseOptionId: option.id,
          packageCount: 1,
          mergeQuantity: true,
        },
      },
    );
    expect(itemRes.status).toBe(201);
    const listItem = itemRes.body as { id: string };

    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items/${listItem.id}/status`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { status: 'bought' },
      },
    );

    const checkoutKey = `checkout-package-${crypto.randomUUID()}`;
    const checkoutBody = {
      idempotencyKey: checkoutKey,
      lines: [
        {
          shoppingListItemId: listItem.id,
          quantity: '100.000',
          inputUnit: 'milliliter',
          location: 'fridge',
          priceMinor: 599,
          productId: milk.id,
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
    const purchase = checkout.body as { id: string };

    const stockRows = await queryTestDb<{ quantity: string }>(
      `SELECT "quantity"::text AS quantity FROM "StockItem" WHERE "productId" = $1`,
      [milk.id],
    );
    expect(stockRows[0]?.quantity).toBe('1000.000');

    const duplicate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases/checkout`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: checkoutBody,
      },
    );
    expect(duplicate.status).toBe(201);
    expect((duplicate.body as { id: string }).id).toBe(purchase.id);

    const stockCount = await queryTestDb<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "StockItem" WHERE "productId" = $1`,
      [milk.id],
    );
    expect(Number(stockCount[0]?.count)).toBe(1);
  });

  it('allows many non-default options and changes default atomically', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Wiele wariantów');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko warianty',
      defaultUnit: 'milliliter',
    });

    const carton = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Karton 1 l',
      contentQuantity: '1000.000',
      contentUnit: 'milliliter',
      isDefault: true,
    });
    expect(carton.status).toBe(201);
    const cartonId = (carton.body as { id: string }).id;

    const bottle500 = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Butelka 500 ml',
      contentQuantity: '500.000',
      contentUnit: 'milliliter',
      isDefault: false,
    });
    expect(bottle500.status).toBe(201);
    const bottle500Id = (bottle500.body as { id: string }).id;

    const bottle2l = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Butelka 2 l',
      contentQuantity: '2000.000',
      contentUnit: 'milliliter',
      isDefault: false,
    });
    expect(bottle2l.status).toBe(201);
    const bottle2lId = (bottle2l.body as { id: string }).id;

    const listedBefore = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/purchase-options`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(listedBefore.status).toBe(200);
    const before = listedBefore.body as Array<{
      id: string;
      name: string;
      isDefault: boolean;
    }>;
    expect(before).toHaveLength(3);
    expect(before.filter((option) => option.isDefault)).toHaveLength(1);
    expect(before.find((option) => option.id === cartonId)?.isDefault).toBe(
      true,
    );
    expect(before.find((option) => option.id === bottle500Id)?.isDefault).toBe(
      false,
    );
    expect(before.find((option) => option.id === bottle2lId)?.isDefault).toBe(
      false,
    );

    const defaultsInDbBefore = await queryTestDb<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "ProductPurchaseOption"
       WHERE "productId" = $1 AND "isDefault" = true`,
      [milk.id],
    );
    expect(Number(defaultsInDbBefore[0]?.count)).toBe(1);

    const switchDefault = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/purchase-options/${bottle2lId}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { isDefault: true },
      },
    );
    expect(switchDefault.status).toBe(200);
    expect((switchDefault.body as { isDefault: boolean }).isDefault).toBe(true);

    const listedAfter = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/purchase-options`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const after = listedAfter.body as Array<{ id: string; isDefault: boolean }>;
    expect(after.filter((option) => option.isDefault)).toHaveLength(1);
    expect(after.find((option) => option.id === bottle2lId)?.isDefault).toBe(
      true,
    );
    expect(after.find((option) => option.id === cartonId)?.isDefault).toBe(
      false,
    );

    const defaultsInDbAfter = await queryTestDb<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "ProductPurchaseOption"
       WHERE "productId" = $1 AND "isDefault" = true`,
      [milk.id],
    );
    expect(Number(defaultsInDbAfter[0]?.count)).toBe(1);

    const indexDef = await queryTestDb<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'ProductPurchaseOption'
         AND indexname = 'ProductPurchaseOption_productId_default_uidx'`,
    );
    expect(indexDef[0]?.indexdef).toMatch(/UNIQUE/i);
    expect(indexDef[0]?.indexdef).toMatch(/"productId"/);
    expect(indexDef[0]?.indexdef).toMatch(/WHERE.*"isDefault".*=.*true/i);
  });

  it('rejects purchase option contentUnit that mismatches product unit', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Jednostka wariantu');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko ml',
      defaultUnit: 'milliliter',
    });

    const mismatch = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Opakowanie sztuk',
      contentQuantity: '1.000',
      contentUnit: 'piece',
      isDefault: true,
    });
    expect(mismatch.status).toBe(400);

    const ok = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Karton 1 l',
      contentQuantity: '1000.000',
      contentUnit: 'milliliter',
      isDefault: true,
    });
    expect(ok.status).toBe(201);

    const updateMismatch = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/purchase-options/${(ok.body as { id: string }).id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { contentUnit: 'piece' },
      },
    );
    expect(updateMismatch.status).toBe(400);
  });

  it('returns 409 when gap idempotency key reused with different purchase selection', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Idempotencja selekcji');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko sel',
      defaultUnit: 'milliliter',
    });
    const carton = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Karton 1 l',
      contentQuantity: '1000.000',
      contentUnit: 'milliliter',
      isDefault: true,
    });
    const bottle = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Butelka 500 ml',
      contentQuantity: '500.000',
      contentUnit: 'milliliter',
      isDefault: false,
    });
    const cartonId = (carton.body as { id: string }).id;
    const bottleId = (bottle.body as { id: string }).id;

    const recipeRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          name: 'Kakao',
          servings: 1,
          difficulty: 'easy',
          ingredients: [
            {
              name: 'Mleko',
              quantity: '100.000',
              unit: 'milliliter',
              productId: milk.id,
              sortOrder: 0,
            },
          ],
          steps: [{ instruction: 'Podgrzej.', sortOrder: 0 }],
        },
      },
    );
    const recipe = recipeRes.body as {
      id: string;
      ingredients: Array<{ id: string }>;
    };
    const ingredientId = recipe.ingredients[0]?.id as string;
    const idempotencyKey = `gap-sel-${crypto.randomUUID()}`;

    const first = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey,
          servings: 1,
          selections: [
            {
              ingredientId,
              purchaseOptionId: cartonId,
              packageCount: 1,
            },
          ],
        },
      },
    );
    expect(first.status).toBe(201);

    const differentOption = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey,
          servings: 1,
          selections: [
            {
              ingredientId,
              purchaseOptionId: bottleId,
              packageCount: 1,
            },
          ],
        },
      },
    );
    expect(differentOption.status).toBe(409);

    const differentCount = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey,
          servings: 1,
          selections: [
            {
              ingredientId,
              purchaseOptionId: cartonId,
              packageCount: 2,
            },
          ],
        },
      },
    );
    expect(differentCount.status).toBe(409);

    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { purchaseMode: 'exact' },
      },
    );

    const exactKey = `gap-exact-sel-${crypto.randomUUID()}`;
    const exactFirst = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: exactKey,
          servings: 1,
          selections: [
            {
              ingredientId,
              exactQuantity: '100.000',
            },
          ],
        },
      },
    );
    expect(exactFirst.status).toBe(201);

    const exactDifferentQty = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: exactKey,
          servings: 1,
          selections: [
            {
              ingredientId,
              exactQuantity: '150.000',
            },
          ],
        },
      },
    );
    expect(exactDifferentQty.status).toBe(409);

    const exactSame = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: exactKey,
          servings: 1,
          selections: [
            {
              ingredientId,
              exactQuantity: '100.000',
            },
          ],
        },
      },
    );
    expect(exactSame.status).toBe(201);
  });

  it('keeps only one default purchase option when creating a second default', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Jeden default');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko default',
      defaultUnit: 'milliliter',
    });

    const first = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Karton 1 l',
      contentQuantity: '1000.000',
      contentUnit: 'milliliter',
      isDefault: true,
    });
    const firstId = (first.body as { id: string }).id;

    const second = await createPurchaseOption(owner, kitchen.id, milk.id, {
      name: 'Butelka 500 ml',
      contentQuantity: '500.000',
      contentUnit: 'milliliter',
      isDefault: true,
    });
    const secondId = (second.body as { id: string }).id;

    const listed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/purchase-options`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const options = (
      listed.body as Array<{ id: string; isDefault: boolean }>
    ).filter((option) => option.isDefault);
    expect(options).toHaveLength(1);
    expect(options[0]?.id).toBe(secondId);

    const firstAfter = (
      listed.body as Array<{ id: string; isDefault: boolean }>
    ).find((option) => option.id === firstId);
    expect(firstAfter?.isDefault).toBe(false);
  });

  it('isolates purchase options between kitchens', async () => {
    const ownerA = await signUpUser(api.origin, WEB_ORIGIN);
    const ownerB = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenA = await createKitchen(ownerA, 'Kuchnia opcji A');
    const kitchenB = await createKitchen(ownerB, 'Kuchnia opcji B');
    const productA = await createProduct(ownerA, kitchenA.id, {
      name: 'Produkt A',
      defaultUnit: 'gram',
    });
    const productB = await createProduct(ownerB, kitchenB.id, {
      name: 'Produkt B',
      defaultUnit: 'gram',
    });

    await createPurchaseOption(ownerA, kitchenA.id, productA.id, {
      name: 'Opakowanie 500 g',
      contentQuantity: '500.000',
      contentUnit: 'gram',
      isDefault: true,
    });

    const foreignList = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/products/${productB.id}/purchase-options`,
      { webOrigin: WEB_ORIGIN, cookies: ownerB.cookies },
    );
    expect(foreignList.status).toBe(404);

    const foreignCreate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/products/${productB.id}/purchase-options`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerB.cookies,
        body: {
          name: 'Obce',
          contentQuantity: '100.000',
          contentUnit: 'gram',
        },
      },
    );
    expect(foreignCreate.status).toBe(404);
  });

  it('preserves legacy shopping list items after migration fields', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Legacy shopping');
    const product = await createProduct(owner, kitchen.id, {
      name: 'Legacy produkt',
      defaultUnit: 'piece',
    });

    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { purchaseMode: 'exact' },
      },
    );

    const legacyItem = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: product.id,
          plannedQuantity: '2.000',
          plannedUnit: 'piece',
        },
      },
    );
    expect(legacyItem.status).toBe(201);
    const body = legacyItem.body as {
      plannedQuantity: string;
      requiredQuantity: string | null;
      purchaseOptionId: string | null;
      packageCount: number | null;
      sourceRecipeId: string | null;
    };
    expect(body.plannedQuantity).toBe('2.000');
    expect(body.requiredQuantity).toBeNull();
    expect(body.purchaseOptionId).toBeNull();
    expect(body.packageCount).toBeNull();
    expect(body.sourceRecipeId).toBeNull();
  });

  it('stores and returns recipe step title and duration', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Kroki przepisu');

    const recipeRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          name: 'Risotto',
          servings: 2,
          difficulty: 'medium',
          ingredients: [
            {
              name: 'Ryż',
              quantity: '200.000',
              unit: 'gram',
              sortOrder: 0,
            },
          ],
          steps: [
            {
              title: 'Smażenie',
              instruction: 'Podsmaż cebulę.',
              durationMinutes: 5,
              sortOrder: 0,
            },
            {
              instruction: 'Gotuj ryż.',
              sortOrder: 1,
            },
          ],
        },
      },
    );
    expect(recipeRes.status).toBe(201);
    const recipe = recipeRes.body as {
      id: string;
      steps: Array<{
        title: string | null;
        durationMinutes: number | null;
        instruction: string;
      }>;
    };
    expect(recipe.steps[0]?.title).toBe('Smażenie');
    expect(recipe.steps[0]?.durationMinutes).toBe(5);
    expect(recipe.steps[1]?.title).toBeNull();
    expect(recipe.steps[1]?.durationMinutes).toBeNull();

    const detail = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(detail.status).toBe(200);
    const steps = (detail.body as typeof recipe).steps;
    expect(steps[0]?.title).toBe('Smażenie');
    expect(steps[0]?.durationMinutes).toBe(5);
  });

  it('includes purchaseOptions when listing products', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Lista produktów opcje');
    const product = await createProduct(owner, kitchen.id, {
      name: 'Jogurt',
      defaultUnit: 'gram',
    });

    await createPurchaseOption(owner, kitchen.id, product.id, {
      name: 'Kubek 400 g',
      contentQuantity: '400.000',
      contentUnit: 'gram',
      isDefault: true,
    });

    const listed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(listed.status).toBe(200);
    const found = (
      listed.body as Array<{
        id: string;
        purchaseOptions: Array<{ name: string }>;
      }>
    ).find((item) => item.id === product.id);
    expect(found?.purchaseOptions).toHaveLength(1);
    expect(found?.purchaseOptions[0]?.name).toBe('Kubek 400 g');
  });
});
