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

describe('Product purchase mode (e2e)', () => {
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
    return response.body as {
      id: string;
      purchaseMode: string;
      purchaseOptions: unknown[];
    };
  }

  async function configurePurchase(
    user: TestUser,
    kitchenId: string,
    productId: string,
    body: Record<string, unknown>,
  ) {
    return apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/configure-purchase`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: user.cookies,
        body,
      },
    );
  }

  async function createRecipeWithMilk(
    user: TestUser,
    kitchenId: string,
    milkId: string,
    quantity = '100.000',
  ) {
    const recipeRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: user.cookies,
        body: {
          name: `Przepis ${crypto.randomUUID().slice(0, 8)}`,
          servings: 1,
          difficulty: 'easy',
          ingredients: [
            {
              name: 'Mleko',
              quantity,
              unit: 'milliliter',
              productId: milkId,
              sortOrder: 0,
            },
          ],
          steps: [{ instruction: 'Wlej mleko.', sortOrder: 0 }],
        },
      },
    );
    expect(recipeRes.status).toBe(201);
    return recipeRes.body as {
      id: string;
      ingredients: Array<{ id: string }>;
    };
  }

  it('1-3: milk without options is unconfigured; gap add fails without creating 100 ml item', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Tryb unconfigured');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko',
      defaultUnit: 'milliliter',
    });
    expect(milk.purchaseMode).toBe('unconfigured');
    expect(milk.purchaseOptions).toEqual([]);

    const recipe = await createRecipeWithMilk(owner, kitchen.id, milk.id);

    const availability = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/availability?servings=1`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(availability.status).toBe(200);
    const proposal = (
      availability.body as {
        ingredients: Array<{
          purchaseProposal: { mode: string; totalPurchaseQuantity: string };
        }>;
      }
    ).ingredients[0]?.purchaseProposal;
    expect(proposal?.mode).toBe('unconfigured');
    expect(proposal?.totalPurchaseQuantity).toBe('100.000');

    const addGaps = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `gap-unconfigured-${crypto.randomUUID()}`,
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

  it('4-5: configure Karton 1 l → packaged; gap 100 ml → 1 × carton', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Tryb packaged');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko karton',
      defaultUnit: 'milliliter',
    });

    const configured = await configurePurchase(owner, kitchen.id, milk.id, {
      mode: 'packaged',
      option: {
        name: 'Karton 1 l',
        contentQuantity: '1000.000',
        contentUnit: 'milliliter',
        isDefault: true,
      },
    });
    expect(configured.status).toBe(201);
    const product = configured.body as {
      purchaseMode: string;
      purchaseOptions: Array<{ name: string; isDefault: boolean }>;
    };
    expect(product.purchaseMode).toBe('packaged');
    expect(product.purchaseOptions).toHaveLength(1);
    expect(product.purchaseOptions[0]?.name).toBe('Karton 1 l');

    const recipe = await createRecipeWithMilk(owner, kitchen.id, milk.id);
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
            packageCount: number;
            totalPurchaseQuantity: string;
          };
        }>;
      }
    ).ingredients[0]?.purchaseProposal;
    expect(proposal?.mode).toBe('packages');
    expect(proposal?.packageCount).toBe(1);
    expect(proposal?.totalPurchaseQuantity).toBe('1000.000');

    const addGaps = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `gap-packaged-${crypto.randomUUID()}`,
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
        plannedQuantity: string;
        packageCount: number;
        purchaseOption: { name: string } | null;
      }>
    )[0];
    expect(item?.plannedQuantity).toBe('1000.000');
    expect(item?.packageCount).toBe(1);
    expect(item?.purchaseOption?.name).toBe('Karton 1 l');
  });

  it('6: conscious exact allows 100 ml', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Tryb exact');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko exact',
      defaultUnit: 'milliliter',
    });

    const configured = await configurePurchase(owner, kitchen.id, milk.id, {
      mode: 'exact',
    });
    expect(configured.status).toBe(201);
    expect((configured.body as { purchaseMode: string }).purchaseMode).toBe(
      'exact',
    );

    const recipe = await createRecipeWithMilk(owner, kitchen.id, milk.id);
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
    expect(addGaps.status).toBe(201);

    const list = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const item = (
      list.body as Array<{
        plannedQuantity: string;
        purchaseOptionId: string | null;
        packageCount: number | null;
      }>
    )[0];
    expect(item?.plannedQuantity).toBe('100.000');
    expect(item?.purchaseOptionId).toBeNull();
    expect(item?.packageCount).toBeNull();
  });

  it('7-8: existing exact item converts in place to carton without duplicate', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Konwersja pozycji');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko konwersja',
      defaultUnit: 'milliliter',
    });

    await configurePurchase(owner, kitchen.id, milk.id, { mode: 'exact' });

    const createItem = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: milk.id,
          plannedQuantity: '100.000',
          plannedUnit: 'milliliter',
          requiredQuantity: '100.000',
          requiredUnit: 'milliliter',
          mergeQuantity: true,
        },
      },
    );
    expect(createItem.status).toBe(201);
    const item = createItem.body as { id: string };

    const optionRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/purchase-options`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          name: 'Karton 1 l',
          contentQuantity: '1000.000',
          contentUnit: 'milliliter',
          isDefault: true,
        },
      },
    );
    expect(optionRes.status).toBe(201);
    const option = optionRes.body as { id: string };

    // createPurchaseOption sets packaged; convert same item
    const convert = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items/${item.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          purchaseOptionId: option.id,
          packageCount: 1,
        },
      },
    );
    expect(convert.status).toBe(200);
    const converted = convert.body as {
      id: string;
      plannedQuantity: string;
      packageCount: number;
      requiredQuantity: string;
      purchaseOptionId: string;
    };
    expect(converted.id).toBe(item.id);
    expect(converted.plannedQuantity).toBe('1000.000');
    expect(converted.packageCount).toBe(1);
    expect(converted.requiredQuantity).toBe('100.000');
    expect(converted.purchaseOptionId).toBe(option.id);

    const list = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect((list.body as unknown[]).length).toBe(1);
  });

  it('9: checkout carton adds 1000 ml stock', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Checkout karton');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko checkout mode',
      defaultUnit: 'milliliter',
    });
    const configured = await configurePurchase(owner, kitchen.id, milk.id, {
      mode: 'packaged',
      option: {
        name: 'Karton 1 l',
        contentQuantity: '1000.000',
        contentUnit: 'milliliter',
        isDefault: true,
      },
    });
    const optionId = (
      configured.body as { purchaseOptions: Array<{ id: string }> }
    ).purchaseOptions[0]!.id;

    const itemRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: milk.id,
          purchaseOptionId: optionId,
          packageCount: 1,
          requiredQuantity: '100.000',
          requiredUnit: 'milliliter',
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

    const checkout = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases/checkout`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `checkout-mode-${crypto.randomUUID()}`,
          lines: [
            {
              shoppingListItemId: listItem.id,
              quantity: '100.000',
              inputUnit: 'milliliter',
              location: 'fridge',
              priceMinor: 499,
              productId: milk.id,
            },
          ],
        },
      },
    );
    expect(checkout.status).toBe(201);

    const stockRows = await queryTestDb<{ quantity: string }>(
      `SELECT "quantity"::text AS quantity FROM "StockItem" WHERE "productId" = $1`,
      [milk.id],
    );
    expect(stockRows[0]?.quantity).toBe('1000.000');
  });

  it('10: unconfigured cannot checkout', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Checkout unconfigured');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko no checkout',
      defaultUnit: 'milliliter',
    });

    // Bypass create validation by inserting a list item after temporarily setting exact,
    // then flipping product back to unconfigured before checkout.
    await configurePurchase(owner, kitchen.id, milk.id, { mode: 'exact' });
    const itemRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: milk.id,
          plannedQuantity: '100.000',
          plannedUnit: 'milliliter',
          mergeQuantity: true,
        },
      },
    );
    expect(itemRes.status).toBe(201);
    const listItem = itemRes.body as { id: string };

    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { purchaseMode: 'unconfigured' },
      },
    );

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

    const checkout = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases/checkout`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `checkout-unconfigured-${crypto.randomUUID()}`,
          lines: [
            {
              shoppingListItemId: listItem.id,
              quantity: '100.000',
              inputUnit: 'milliliter',
              location: 'fridge',
              priceMinor: 100,
              productId: milk.id,
            },
          ],
        },
      },
    );
    expect(checkout.status).toBe(400);
    expect(JSON.stringify(checkout.body)).toContain(
      'Produkt wymaga konfiguracji sposobu zakupu.',
    );
  });

  it('11: historical purchases unchanged after mode change', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Historia zakupów');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko historia',
      defaultUnit: 'milliliter',
    });
    const configured = await configurePurchase(owner, kitchen.id, milk.id, {
      mode: 'packaged',
      option: {
        name: 'Karton 1 l',
        contentQuantity: '1000.000',
        contentUnit: 'milliliter',
        isDefault: true,
      },
    });
    const optionId = (
      configured.body as { purchaseOptions: Array<{ id: string }> }
    ).purchaseOptions[0]!.id;

    const itemRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: milk.id,
          purchaseOptionId: optionId,
          packageCount: 1,
          mergeQuantity: true,
        },
      },
    );
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

    const checkout = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases/checkout`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `hist-${crypto.randomUUID()}`,
          lines: [
            {
              shoppingListItemId: listItem.id,
              quantity: '1000.000',
              inputUnit: 'milliliter',
              location: 'fridge',
              priceMinor: 599,
              productId: milk.id,
            },
          ],
        },
      },
    );
    expect(checkout.status).toBe(201);
    const purchase = checkout.body as {
      id: string;
      lines: Array<{ quantity: string; priceMinor: number }>;
    };
    expect(purchase.lines[0]?.quantity).toBe('1000.000');
    expect(purchase.lines[0]?.priceMinor).toBe(599);

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

    const detail = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/purchases/${purchase.id}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(detail.status).toBe(200);
    const lines = (
      detail.body as { lines: Array<{ quantity: string; priceMinor: number }> }
    ).lines;
    expect(lines[0]?.quantity).toBe('1000.000');
    expect(lines[0]?.priceMinor).toBe(599);

    const stockRows = await queryTestDb<{ quantity: string }>(
      `SELECT "quantity"::text AS quantity FROM "StockItem" WHERE "productId" = $1`,
      [milk.id],
    );
    expect(stockRows[0]?.quantity).toBe('1000.000');
  });

  it('12: kitchen / option isolation still works', async () => {
    const ownerA = await signUpUser(api.origin, WEB_ORIGIN);
    const ownerB = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenA = await createKitchen(ownerA, 'Kuchnia A');
    const kitchenB = await createKitchen(ownerB, 'Kuchnia B');

    const productA = await createProduct(ownerA, kitchenA.id, {
      name: 'Mleko A',
      defaultUnit: 'milliliter',
    });
    const productB = await createProduct(ownerB, kitchenB.id, {
      name: 'Mleko B',
      defaultUnit: 'milliliter',
    });

    const optB = await configurePurchase(ownerB, kitchenB.id, productB.id, {
      mode: 'packaged',
      option: {
        name: 'Karton B',
        contentQuantity: '1000.000',
        contentUnit: 'milliliter',
        isDefault: true,
      },
    });
    const optionBId = (optB.body as { purchaseOptions: Array<{ id: string }> })
      .purchaseOptions[0]!.id;

    await configurePurchase(ownerA, kitchenA.id, productA.id, {
      mode: 'packaged',
      option: {
        name: 'Karton A',
        contentQuantity: '1000.000',
        contentUnit: 'milliliter',
        isDefault: true,
      },
    });

    const foreignOption = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: {
          productId: productA.id,
          purchaseOptionId: optionBId,
          packageCount: 1,
          mergeQuantity: true,
        },
      },
    );
    expect(foreignOption.status).toBe(400);

    const foreignProduct = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/products/${productB.id}/configure-purchase`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: { mode: 'exact' },
      },
    );
    expect(foreignProduct.status).toBe(400);
  });
});
