import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
  type TestUser,
} from './create-api-app';
import { closeTestPool, executeTestDb, queryTestDb } from './pg-client';

jest.setTimeout(120_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';

type KitchenRef = { id: string };
type ProductRef = { id: string };
type RecipeRef = { id: string };

describe('Recipes (e2e)', () => {
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
    owner: TestUser,
    name: string,
  ): Promise<KitchenRef> {
    const response = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name },
    });
    expect(response.status).toBe(201);
    return response.body as KitchenRef;
  }

  async function inviteMember(
    owner: TestUser,
    kitchenId: string,
    member: TestUser,
  ): Promise<void> {
    const inviteRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/invites`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { email: member.email },
      },
    );
    expect(inviteRes.status).toBe(201);
    const invite = inviteRes.body as { inviteUrl: string };
    const token = invite.inviteUrl.split('/').pop() ?? '';
    const accepted = await apiFetch(
      api.origin,
      `/api/invites/${token}/accept`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
      },
    );
    expect(accepted.status).toBe(201);
  }

  async function createProduct(
    user: TestUser,
    kitchenId: string,
    body: { name: string; defaultUnit: string },
  ): Promise<ProductRef> {
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
    const product = response.body as ProductRef;
    const modeRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${product.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: user.cookies,
        body: { purchaseMode: 'exact' },
      },
    );
    expect(modeRes.status).toBe(200);
    return product;
  }

  async function createStockItem(
    user: TestUser,
    kitchenId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const response = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/stock-items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: user.cookies,
        body,
      },
    );
    expect(response.status).toBe(201);
  }

  function sampleRecipeBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Omlet',
      description: 'Prosty omlet',
      servings: 2,
      prepTimeMinutes: 5,
      cookTimeMinutes: 10,
      difficulty: 'easy',
      tags: ['śniadanie'],
      visibility: 'private',
      ingredients: [
        {
          name: 'Jajka',
          quantity: '2.000',
          unit: 'piece',
          sortOrder: 0,
        },
        {
          name: 'Oliwa',
          quantity: '1.000',
          unit: 'tablespoon',
          sortOrder: 1,
        },
      ],
      steps: [
        { instruction: 'Ubij jajka.', sortOrder: 0 },
        { instruction: 'Usmaż na patelni.', sortOrder: 1 },
      ],
      ...overrides,
    };
  }

  async function createRecipe(
    user: TestUser,
    kitchenId: string,
    body: Record<string, unknown> = sampleRecipeBody(),
  ): Promise<RecipeRef> {
    const response = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: user.cookies,
        body,
      },
    );
    expect(response.status).toBe(201);
    return response.body as RecipeRef;
  }

  it('keeps private recipes visible only to the author', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const outsider = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Prywatność przepisów');
    await inviteMember(owner, kitchen.id, member);

    const recipe = await createRecipe(owner, kitchen.id);

    const ownerGet = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(ownerGet.status).toBe(200);

    const memberGet = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      { webOrigin: WEB_ORIGIN, cookies: member.cookies },
    );
    expect(memberGet.status).toBe(404);

    const outsiderGet = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      { webOrigin: WEB_ORIGIN, cookies: outsider.cookies },
    );
    expect(outsiderGet.status).toBe(404);

    const memberList = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes?filter=all`,
      { webOrigin: WEB_ORIGIN, cookies: member.cookies },
    );
    expect(memberList.status).toBe(200);
    expect((memberList.body as unknown[]).length).toBe(0);
  });

  it('shows kitchen-shared recipes to all members', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Udostępnione przepisy');
    await inviteMember(owner, kitchen.id, member);

    const recipe = await createRecipe(
      owner,
      kitchen.id,
      sampleRecipeBody({ visibility: 'kitchen', name: 'Wspólny omlet' }),
    );

    const memberGet = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      { webOrigin: WEB_ORIGIN, cookies: member.cookies },
    );
    expect(memberGet.status).toBe(200);
    expect((memberGet.body as { name: string }).name).toBe('Wspólny omlet');

    const filtered = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes?filter=kitchen`,
      { webOrigin: WEB_ORIGIN, cookies: member.cookies },
    );
    expect(filtered.status).toBe(200);
    expect((filtered.body as unknown[]).length).toBe(1);
  });

  it('allows only the author to edit and delete recipes', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Autor przepisu');
    await inviteMember(owner, kitchen.id, member);

    const recipe = await createRecipe(
      owner,
      kitchen.id,
      sampleRecipeBody({ visibility: 'kitchen' }),
    );

    const memberPatch = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
        body: { name: 'Zmiana przez członka' },
      },
    );
    expect(memberPatch.status).toBe(403);

    const ownerPatch = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { visibility: 'kitchen', name: 'Omlet poprawiony' },
      },
    );
    expect(ownerPatch.status).toBe(200);
    expect((ownerPatch.body as { name: string }).name).toBe('Omlet poprawiony');

    const memberDelete = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
      },
    );
    expect(memberDelete.status).toBe(403);

    const ownerDelete = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(ownerDelete.status).toBe(204);
  });

  it('preserves ingredient and step order', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Kolejność');

    const recipe = await createRecipe(
      owner,
      kitchen.id,
      sampleRecipeBody({
        ingredients: [
          { name: 'Pierwszy', quantity: '1.000', unit: 'piece', sortOrder: 0 },
          { name: 'Drugi', quantity: '2.000', unit: 'piece', sortOrder: 1 },
        ],
        steps: [
          { instruction: 'Krok 1', sortOrder: 0 },
          { instruction: 'Krok 2', sortOrder: 1 },
        ],
      }),
    );

    const detail = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(detail.status).toBe(200);
    const body = detail.body as {
      ingredients: Array<{ name: string; sortOrder: number }>;
      steps: Array<{ instruction: string; sortOrder: number }>;
    };
    expect(body.ingredients.map((item) => item.name)).toEqual([
      'Pierwszy',
      'Drugi',
    ]);
    expect(body.steps.map((item) => item.instruction)).toEqual([
      'Krok 1',
      'Krok 2',
    ]);
  });

  it('computes availability with scaling, conversions and safe unit handling', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Dostępność');

    const eggs = await createProduct(owner, kitchen.id, {
      name: 'Jajka',
      defaultUnit: 'piece',
    });
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko',
      defaultUnit: 'milliliter',
    });
    const flour = await createProduct(owner, kitchen.id, {
      name: 'Mąka',
      defaultUnit: 'gram',
    });

    await createStockItem(owner, kitchen.id, {
      productId: eggs.id,
      quantity: '3.000',
      location: 'pantry',
      purchasePriceMinor: 1000,
    });
    await createStockItem(owner, kitchen.id, {
      productId: milk.id,
      quantity: '500.000',
      location: 'fridge',
      purchasePriceMinor: 500,
    });
    await createStockItem(owner, kitchen.id, {
      productId: flour.id,
      quantity: '1000.000',
      location: 'pantry',
      purchasePriceMinor: 400,
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    const recipe = await createRecipe(
      owner,
      kitchen.id,
      sampleRecipeBody({
        servings: 2,
        ingredients: [
          {
            name: 'Jajka',
            quantity: '2.000',
            unit: 'piece',
            productId: eggs.id,
            sortOrder: 0,
          },
          {
            name: 'Mleko',
            quantity: '1.000',
            unit: 'liter',
            productId: milk.id,
            sortOrder: 1,
          },
          {
            name: 'Mąka',
            quantity: '0.500',
            unit: 'kilogram',
            productId: flour.id,
            sortOrder: 2,
          },
          {
            name: 'Oliwa',
            quantity: '2.000',
            unit: 'tablespoon',
            sortOrder: 3,
          },
        ],
      }),
    );

    const availability = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/availability?servings=4`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(availability.status).toBe(200);
    const body = availability.body as {
      servings: number;
      baseServings: number;
      ingredients: Array<{
        name: string;
        status: string;
        scaledQuantity: string | null;
        gapQuantity: string | null;
      }>;
    };
    expect(body.servings).toBe(4);
    expect(body.baseServings).toBe(2);

    const byName = Object.fromEntries(
      body.ingredients.map((item) => [item.name, item]),
    );
    expect(byName['Jajka']?.scaledQuantity).toBe('4.000');
    expect(byName['Jajka']?.status).toBe('partial');
    expect(byName['Jajka']?.gapQuantity).toBe('1.000');
    expect(byName['Mleko']?.status).toBe('partial');
    expect(byName['Mąka']?.status).toBe('missing');
    expect(byName['Oliwa']?.status).toBe('unknown');
  });

  it('adds only missing quantities to shopping list with idempotency', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Braki do listy');

    const eggs = await createProduct(owner, kitchen.id, {
      name: 'Jajka',
      defaultUnit: 'piece',
    });
    await createStockItem(owner, kitchen.id, {
      productId: eggs.id,
      quantity: '1.000',
      location: 'pantry',
      purchasePriceMinor: 1000,
    });

    const recipe = await createRecipe(
      owner,
      kitchen.id,
      sampleRecipeBody({
        servings: 2,
        ingredients: [
          {
            name: 'Jajka',
            quantity: '4.000',
            unit: 'piece',
            productId: eggs.id,
            sortOrder: 0,
          },
        ],
        steps: [{ instruction: 'Usmaż.', sortOrder: 0 }],
      }),
    );

    const idempotencyKey = `recipe-gap-${crypto.randomUUID()}`;
    const firstAdd = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey,
          servings: 2,
        },
      },
    );
    expect(firstAdd.status).toBe(201);
    const firstBody = firstAdd.body as {
      added: Array<{ quantity: string; shoppingListItemId: string }>;
      skipped: unknown[];
    };
    expect(firstBody.added).toHaveLength(1);
    expect(firstBody.added[0]?.quantity).toBe('3.000');

    const list = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(list.status).toBe(200);
    expect((list.body as unknown[]).length).toBe(1);
    expect(
      (list.body as Array<{ plannedQuantity: string }>)[0]?.plannedQuantity,
    ).toBe('3.000');

    const secondAdd = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey,
          servings: 2,
        },
      },
    );
    expect(secondAdd.status).toBe(201);
    expect(
      (secondAdd.body as { added: Array<{ shoppingListItemId: string }> })
        .added[0]?.shoppingListItemId,
    ).toBe(firstBody.added[0]?.shoppingListItemId);

    const listAfterRetry = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect((listAfterRetry.body as unknown[]).length).toBe(1);
    expect(
      (listAfterRetry.body as Array<{ plannedQuantity: string }>)[0]
        ?.plannedQuantity,
    ).toBe('3.000');
  });

  it('scopes idempotency to key and allows intentional re-add with a new key', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenA = await createKitchen(owner, 'Idempotencja A');
    const kitchenB = await createKitchen(owner, 'Idempotencja B');

    const eggsA = await createProduct(owner, kitchenA.id, {
      name: 'Jajka A',
      defaultUnit: 'piece',
    });
    const eggsB = await createProduct(owner, kitchenB.id, {
      name: 'Jajka B',
      defaultUnit: 'piece',
    });

    const recipeA = await createRecipe(
      owner,
      kitchenA.id,
      sampleRecipeBody({
        name: 'Omlet A',
        servings: 2,
        ingredients: [
          {
            name: 'Jajka',
            quantity: '4.000',
            unit: 'piece',
            productId: eggsA.id,
            sortOrder: 0,
          },
        ],
        steps: [{ instruction: 'Usmaż.', sortOrder: 0 }],
      }),
    );
    const recipeB = await createRecipe(
      owner,
      kitchenB.id,
      sampleRecipeBody({
        name: 'Omlet B',
        servings: 2,
        ingredients: [
          {
            name: 'Jajka',
            quantity: '4.000',
            unit: 'piece',
            productId: eggsB.id,
            sortOrder: 0,
          },
        ],
        steps: [{ instruction: 'Usmaż.', sortOrder: 0 }],
      }),
    );

    const sharedKey = `recipe-gap-scope-${crypto.randomUUID()}`;
    const first = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/recipes/${recipeA.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: sharedKey, servings: 2 },
      },
    );
    expect(first.status).toBe(201);

    const wrongRecipe = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/recipes/${recipeB.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: sharedKey, servings: 2 },
      },
    );
    expect(wrongRecipe.status).toBe(409);

    const wrongKitchen = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenB.id}/recipes/${recipeB.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: sharedKey, servings: 2 },
      },
    );
    expect(wrongKitchen.status).toBe(409);

    const wrongServings = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/recipes/${recipeA.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: sharedKey, servings: 4 },
      },
    );
    expect(wrongServings.status).toBe(409);

    const parallelKey = `recipe-gap-parallel-${crypto.randomUUID()}`;
    const [parallelA, parallelB] = await Promise.all([
      apiFetch(
        api.origin,
        `/api/kitchens/${kitchenA.id}/recipes/${recipeA.id}/add-gaps-to-shopping-list`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: { idempotencyKey: parallelKey, servings: 2 },
        },
      ),
      apiFetch(
        api.origin,
        `/api/kitchens/${kitchenA.id}/recipes/${recipeA.id}/add-gaps-to-shopping-list`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: { idempotencyKey: parallelKey, servings: 2 },
        },
      ),
    ]);
    expect([parallelA.status, parallelB.status].sort()).toEqual([201, 201]);
    expect(
      (parallelA.body as { added: Array<{ shoppingListItemId: string }> })
        .added[0]?.shoppingListItemId,
    ).toBe(
      (parallelB.body as { added: Array<{ shoppingListItemId: string }> })
        .added[0]?.shoppingListItemId,
    );

    const listAfterParallel = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/shopping-list/items`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(listAfterParallel.status).toBe(200);
    const eggsItem = (
      listAfterParallel.body as Array<{
        productId: string;
        plannedQuantity: string;
      }>
    ).find((item) => item.productId === eggsA.id);
    // first key (4) + parallel key once (4) => 8, not 12
    expect(eggsItem?.plannedQuantity).toBe('8.000');

    const freshKey = `recipe-gap-fresh-${crypto.randomUUID()}`;
    const intentional = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/recipes/${recipeA.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: freshKey, servings: 2 },
      },
    );
    expect(intentional.status).toBe(201);
    expect(
      (intentional.body as { added: Array<{ quantity: string }> }).added[0]
        ?.quantity,
    ).toBe('4.000');

    const listAfterFresh = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/shopping-list/items`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const eggsAfterFresh = (
      listAfterFresh.body as Array<{
        productId: string;
        plannedQuantity: string;
      }>
    ).find((item) => item.productId === eggsA.id);
    expect(eggsAfterFresh?.plannedQuantity).toBe('12.000');
  });

  it('adds multiple missing ingredients in one transaction', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Transakcja braków');

    const eggs = await createProduct(owner, kitchen.id, {
      name: 'Jajka TX',
      defaultUnit: 'piece',
    });
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko TX',
      defaultUnit: 'milliliter',
    });

    const recipe = await createRecipe(
      owner,
      kitchen.id,
      sampleRecipeBody({
        servings: 2,
        ingredients: [
          {
            name: 'Jajka',
            quantity: '2.000',
            unit: 'piece',
            productId: eggs.id,
            sortOrder: 0,
          },
          {
            name: 'Mleko',
            quantity: '200.000',
            unit: 'milliliter',
            productId: milk.id,
            sortOrder: 1,
          },
        ],
        steps: [{ instruction: 'Wymieszaj.', sortOrder: 0 }],
      }),
    );

    const okKey = `recipe-gap-tx-ok-${crypto.randomUUID()}`;
    const okAdd = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: okKey, servings: 2 },
      },
    );
    expect(okAdd.status).toBe(201);
    expect((okAdd.body as { added: unknown[] }).added).toHaveLength(2);

    const listOk = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect((listOk.body as unknown[]).length).toBe(2);

    await executeTestDb(`
      CREATE OR REPLACE FUNCTION test_fail_second_shopping_item()
      RETURNS trigger AS $$
      BEGIN
        IF (
          SELECT count(*)::int
          FROM "ShoppingListItem"
          WHERE "shoppingListId" = NEW."shoppingListId"
        ) >= 1 THEN
          RAISE EXCEPTION 'test forced failure on second shopping item';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await executeTestDb(`
      DROP TRIGGER IF EXISTS test_fail_second_shopping_item ON "ShoppingListItem";
      CREATE TRIGGER test_fail_second_shopping_item
      BEFORE INSERT ON "ShoppingListItem"
      FOR EACH ROW EXECUTE FUNCTION test_fail_second_shopping_item();
    `);

    try {
      // clear list so both candidates insert again
      await executeTestDb(
        `DELETE FROM "ShoppingListItem" WHERE "productId" = ANY($1::text[])`,
        [[eggs.id, milk.id]],
      );

      const failKey = `recipe-gap-tx-fail-${crypto.randomUUID()}`;
      const failAdd = await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/add-gaps-to-shopping-list`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: { idempotencyKey: failKey, servings: 2 },
        },
      );
      expect(failAdd.status).toBeGreaterThanOrEqual(400);

      const listAfterFail = await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/shopping-list/items`,
        { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
      );
      expect((listAfterFail.body as unknown[]).length).toBe(0);

      const gapRows = await queryTestDb<{ count: string }>(
        `SELECT count(*)::text AS count FROM "RecipeGapAddition" WHERE "idempotencyKey" = $1`,
        [failKey],
      );
      expect(gapRows[0]?.count).toBe('0');
    } finally {
      await executeTestDb(
        `DROP TRIGGER IF EXISTS test_fail_second_shopping_item ON "ShoppingListItem"`,
      );
      await executeTestDb(
        `DROP FUNCTION IF EXISTS test_fail_second_shopping_item()`,
      );
    }
  });

  it('rejects productId from another kitchen on create and update', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Walidacja produktu');
    const otherKitchen = await createKitchen(owner, 'Inna kuchnia produktów');
    await inviteMember(owner, kitchen.id, member);

    const foreignProduct = await createProduct(owner, otherKitchen.id, {
      name: 'Obcy produkt',
      defaultUnit: 'piece',
    });

    const createDenied = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
        body: sampleRecipeBody({
          name: 'Z obcym produktem',
          ingredients: [
            {
              name: 'Obcy',
              quantity: '1.000',
              unit: 'piece',
              productId: foreignProduct.id,
              sortOrder: 0,
            },
          ],
          steps: [{ instruction: 'Krok', sortOrder: 0 }],
        }),
      },
    );
    expect(createDenied.status).toBe(400);

    const recipe = await createRecipe(
      member,
      kitchen.id,
      sampleRecipeBody({ name: 'Do edycji' }),
    );

    const updateDenied = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
        body: {
          ingredients: [
            {
              name: 'Obcy',
              quantity: '1.000',
              unit: 'piece',
              productId: foreignProduct.id,
              sortOrder: 0,
            },
          ],
        },
      },
    );
    expect(updateDenied.status).toBe(400);
  });

  it('supports search and mine filter on recipe list', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Lista przepisów');
    await inviteMember(owner, kitchen.id, member);

    await createRecipe(
      owner,
      kitchen.id,
      sampleRecipeBody({ name: 'Naleśniki', visibility: 'kitchen' }),
    );
    await createRecipe(
      member,
      kitchen.id,
      sampleRecipeBody({ name: 'Pancakes prywatne', visibility: 'private' }),
    );

    const mine = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes?filter=mine`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(mine.status).toBe(200);
    expect(
      (mine.body as Array<{ name: string }>).map((item) => item.name),
    ).toEqual(['Naleśniki']);

    const search = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes?search=nale`,
      { webOrigin: WEB_ORIGIN, cookies: member.cookies },
    );
    expect(search.status).toBe(200);
    expect((search.body as Array<{ name: string }>)[0]?.name).toBe('Naleśniki');
  });

  it('supports ingredient groups, step tips, reorder and group removal without dropping ingredients', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Grupy i wskazówki');
    await inviteMember(owner, kitchen.id, member);

    const doughGroupId = crypto.randomUUID();
    const fillingGroupId = crypto.randomUUID();

    const created = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: sampleRecipeBody({
          name: 'Pierogi',
          ingredientGroups: [
            { id: doughGroupId, name: 'Ciasto', sortOrder: 0 },
            { id: fillingGroupId, name: 'Nadzienie', sortOrder: 1 },
          ],
          ingredients: [
            {
              name: 'Mąka',
              quantity: '300.000',
              unit: 'gram',
              groupId: doughGroupId,
              sortOrder: 0,
            },
            {
              name: 'Woda',
              quantity: '150.000',
              unit: 'milliliter',
              groupId: doughGroupId,
              sortOrder: 1,
            },
            {
              name: 'Twaróg',
              quantity: '250.000',
              unit: 'gram',
              groupId: fillingGroupId,
              sortOrder: 2,
            },
            {
              name: 'Sól',
              quantity: '1.000',
              unit: 'teaspoon',
              sortOrder: 3,
            },
          ],
          steps: [
            {
              title: 'Przygotuj ciasto',
              instruction: 'Wymieszaj mąkę z wodą.',
              tip: 'Nie mieszaj zbyt długo.',
              sortOrder: 0,
            },
            {
              instruction: 'Zrób nadzienie.',
              sortOrder: 1,
            },
          ],
        }),
      },
    );
    expect(created.status).toBe(201);
    const recipe = created.body as {
      id: string;
      ingredientGroups: Array<{ id: string; name: string; sortOrder: number }>;
      ingredients: Array<{
        id: string;
        name: string;
        groupId: string | null;
        sortOrder: number;
      }>;
      steps: Array<{
        id: string;
        title: string | null;
        tip: string | null;
        instruction: string;
        sortOrder: number;
      }>;
    };

    expect(recipe.ingredientGroups.map((group) => group.name)).toEqual([
      'Ciasto',
      'Nadzienie',
    ]);
    expect(
      recipe.ingredients.find((item) => item.name === 'Mąka')?.groupId,
    ).toBe(doughGroupId);
    expect(
      recipe.ingredients.find((item) => item.name === 'Sól')?.groupId,
    ).toBeNull();
    expect(recipe.steps[0]?.title).toBe('Przygotuj ciasto');
    expect(recipe.steps[0]?.tip).toBe('Nie mieszaj zbyt długo.');
    expect(recipe.steps[1]?.tip).toBeNull();

    const flour = recipe.ingredients.find((item) => item.name === 'Mąka');
    const water = recipe.ingredients.find((item) => item.name === 'Woda');
    const cheese = recipe.ingredients.find((item) => item.name === 'Twaróg');
    const salt = recipe.ingredients.find((item) => item.name === 'Sól');
    const stepA = recipe.steps[0];
    const stepB = recipe.steps[1];
    expect(flour && water && cheese && salt && stepA && stepB).toBeTruthy();

    // Usunięcie grupy „Nadzienie”: składniki zostają, bez groupId.
    // Zamiana kolejności grup i składników + edycja wskazówki.
    const patched = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          ingredientGroups: [
            { id: doughGroupId, name: 'Ciasto', sortOrder: 0 },
          ],
          ingredients: [
            {
              id: water?.id,
              name: 'Woda',
              quantity: '160.000',
              unit: 'milliliter',
              groupId: doughGroupId,
              sortOrder: 0,
            },
            {
              id: flour?.id,
              name: 'Mąka',
              quantity: '300.000',
              unit: 'gram',
              groupId: doughGroupId,
              sortOrder: 1,
            },
            {
              id: cheese?.id,
              name: 'Twaróg',
              quantity: '250.000',
              unit: 'gram',
              groupId: null,
              sortOrder: 2,
            },
            {
              id: salt?.id,
              name: 'Sól',
              quantity: '1.000',
              unit: 'teaspoon',
              groupId: null,
              sortOrder: 3,
            },
          ],
          steps: [
            {
              id: stepB?.id,
              instruction: 'Zrób nadzienie.',
              tip: 'Użyj tłustego twarogu.',
              sortOrder: 0,
            },
            {
              id: stepA?.id,
              title: 'Przygotuj ciasto',
              instruction: 'Wymieszaj mąkę z wodą.',
              tip: null,
              sortOrder: 1,
            },
          ],
        },
      },
    );
    expect(patched.status).toBe(200);
    const updated = patched.body as typeof recipe;
    expect(updated.ingredientGroups).toHaveLength(1);
    expect(updated.ingredients).toHaveLength(4);
    expect(
      updated.ingredients.find((item) => item.name === 'Twaróg')?.groupId,
    ).toBeNull();
    expect(updated.ingredients.find((item) => item.id === flour?.id)?.id).toBe(
      flour?.id,
    );
    expect(updated.steps[0]?.id).toBe(stepB?.id);
    expect(updated.steps[0]?.tip).toBe('Użyj tłustego twarogu.');
    expect(updated.steps[1]?.id).toBe(stepA?.id);
    expect(updated.steps[1]?.tip).toBeNull();

    // Zachowanie zdjęcia kroku przy edycji tekstu z tym samym id.
    const mediaId = crypto.randomUUID();
    await executeTestDb(
      `INSERT INTO "MediaAsset" (
         id, "kitchenId", "uploadedByUserId", purpose, "objectKey",
         "mimeType", "byteSize", status, "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, 'recipe_step', $4,
         'image/webp', 100, 'ready', NOW(), NOW()
       )`,
      [
        mediaId,
        kitchen.id,
        owner.id,
        `test/${kitchen.id}/steps/${mediaId}.webp`,
      ],
    );
    await executeTestDb(
      `UPDATE "RecipeStep" SET "imageMediaId" = $1 WHERE id = $2`,
      [mediaId, stepB?.id],
    );

    const keepImage = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          ingredientGroups: [
            { id: doughGroupId, name: 'Ciasto', sortOrder: 0 },
          ],
          ingredients: [
            {
              id: water?.id,
              name: 'Woda',
              quantity: '160.000',
              unit: 'milliliter',
              groupId: doughGroupId,
              sortOrder: 0,
            },
            {
              id: flour?.id,
              name: 'Mąka',
              quantity: '300.000',
              unit: 'gram',
              groupId: doughGroupId,
              sortOrder: 1,
            },
            {
              id: cheese?.id,
              name: 'Twaróg',
              quantity: '250.000',
              unit: 'gram',
              groupId: null,
              sortOrder: 2,
            },
            {
              id: salt?.id,
              name: 'Sól',
              quantity: '1.000',
              unit: 'teaspoon',
              groupId: null,
              sortOrder: 3,
            },
          ],
          steps: [
            {
              id: stepB?.id,
              instruction: 'Zrób nadzienie — poprawione.',
              tip: 'Użyj tłustego twarogu.',
              sortOrder: 0,
            },
            {
              id: stepA?.id,
              title: 'Przygotuj ciasto',
              instruction: 'Wymieszaj mąkę z wodą.',
              tip: null,
              sortOrder: 1,
            },
          ],
        },
      },
    );
    expect(keepImage.status).toBe(200);
    const afterImage = keepImage.body as {
      steps: Array<{ id: string; image: { mediaAssetId: string } | null }>;
    };
    expect(
      afterImage.steps.find((step) => step.id === stepB?.id)?.image
        ?.mediaAssetId,
    ).toBe(mediaId);

    // Stary przepis bez grup nadal działa.
    const legacy = await createRecipe(
      owner,
      kitchen.id,
      sampleRecipeBody({ name: 'Bez grup' }),
    );
    const legacyGet = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${legacy.id}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(legacyGet.status).toBe(200);
    const legacyBody = legacyGet.body as typeof recipe;
    expect(legacyBody.ingredientGroups).toEqual([]);
    expect(legacyBody.ingredients.every((item) => item.groupId === null)).toBe(
      true,
    );
    expect(legacyBody.steps.every((step) => step.tip === null)).toBe(true);

    // Odrzucenie groupId spoza payloadu / innego przepisu.
    const foreignGroupDenied = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${legacy.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          ingredientGroups: [],
          ingredients: [
            {
              name: 'Jajka',
              quantity: '2.000',
              unit: 'piece',
              groupId: doughGroupId,
              sortOrder: 0,
            },
          ],
          steps: [{ instruction: 'Ubij.', sortOrder: 0 }],
        },
      },
    );
    expect(foreignGroupDenied.status).toBe(400);
  });

  it('counts the same product in two groups once per ingredient line for estimate', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Podwójny produkt');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko',
      defaultUnit: 'milliliter',
    });

    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/nutrition`,
      {
        method: 'PUT',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          baseQuantity: '100.000',
          baseUnit: 'milliliter',
          kcal: '50.000',
          proteinGrams: '3.000',
          carbsGrams: '5.000',
          fatGrams: '2.000',
        },
      },
    );

    const groupA = crypto.randomUUID();
    const groupB = crypto.randomUUID();
    const recipe = await createRecipe(
      owner,
      kitchen.id,
      sampleRecipeBody({
        name: 'Podwójne mleko',
        servings: 1,
        ingredientGroups: [
          { id: groupA, name: 'Ciasto', sortOrder: 0 },
          { id: groupB, name: 'Sos', sortOrder: 1 },
        ],
        ingredients: [
          {
            name: 'Mleko do ciasta',
            quantity: '100.000',
            unit: 'milliliter',
            productId: milk.id,
            groupId: groupA,
            sortOrder: 0,
          },
          {
            name: 'Mleko do sosu',
            quantity: '100.000',
            unit: 'milliliter',
            productId: milk.id,
            groupId: groupB,
            sortOrder: 1,
          },
        ],
        steps: [{ instruction: 'Wymieszaj.', sortOrder: 0 }],
      }),
    );

    const estimate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/estimate?servings=1`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(estimate.status).toBe(200);
    const body = estimate.body as {
      nutrition: {
        countedIngredients: number;
        recipe: { kcal: string } | null;
      };
    };
    expect(body.nutrition.countedIngredients).toBe(2);
    expect(body.nutrition.recipe?.kcal).toBe('100.00');
  });
});
