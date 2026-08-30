import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
  type TestUser,
} from './create-api-app';
import { closeTestPool, queryTestDb } from './pg-client';

jest.setTimeout(120_000);

const WEB_ORIGIN = 'http://127.0.0.1:3021';

type RemovalPreview = {
  mode: 'undo' | 'archive' | 'blocked';
  reason: string | null;
  canUndo: boolean;
  canArchive: boolean;
  canWriteOffAndArchive: boolean;
  willRemove: string[];
  willKeep: string[];
  remainingStockQuantity: string | null;
  remainingStockUnit: string | null;
};

type IntakeResult = {
  product: { id: string; name: string };
  stockItem: { id: string; quantity: string } | null;
  removalHint: { canUndo: boolean };
  replayed: boolean;
};

describe('Product undo addition (e2e)', () => {
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

  async function createKitchen(user: TestUser, name: string): Promise<string> {
    const res = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: user.cookies,
      body: { name },
    });
    expect(res.status).toBe(201);
    return (res.body as { id: string }).id;
  }

  async function intakeNewProduct(
    kitchenId: string,
    cookies: Map<string, string>,
    name: string,
    opts: { withNutrition?: boolean; withStock?: boolean } = {},
  ): Promise<IntakeResult> {
    const withNutrition = opts.withNutrition ?? true;
    const withStock = opts.withStock ?? true;
    const res = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/product-intakes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies,
        body: {
          idempotencyKey: `undo-intake-${crypto.randomUUID()}`,
          newProduct: {
            name,
            defaultUnit: 'gram',
          },
          ...(withNutrition
            ? {
                nutrition: {
                  baseQuantity: '100.000',
                  baseUnit: 'gram',
                  kcal: '50.000',
                  proteinGrams: '3.000',
                  carbsGrams: '4.000',
                  fatGrams: '2.000',
                  source: 'manual',
                },
              }
            : {}),
          ...(withStock
            ? {
                stock: {
                  quantity: '450.000',
                  location: 'fridge',
                  purchasePriceMinor: 299,
                  storeName: 'Lidl',
                },
              }
            : {}),
        },
      },
    );
    expect(res.status).toBe(201);
    return res.body as IntakeResult;
  }

  async function removalPreview(
    kitchenId: string,
    productId: string,
    cookies: Map<string, string>,
  ): Promise<{ status: number; body: RemovalPreview }> {
    const res = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/removal-preview`,
      { webOrigin: WEB_ORIGIN, cookies },
    );
    return { status: res.status, body: res.body as RemovalPreview };
  }

  it('intake with stock+nutrition → preview undo → undo removes product', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenId = await createKitchen(owner, 'Undo intake');
    const intake = await intakeNewProduct(
      kitchenId,
      owner.cookies,
      'Jogurt Undo',
    );
    expect(intake.removalHint.canUndo).toBe(true);
    expect(intake.stockItem).not.toBeNull();

    const preview = await removalPreview(
      kitchenId,
      intake.product.id,
      owner.cookies,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.mode).toBe('undo');
    expect(preview.body.canUndo).toBe(true);
    expect(preview.body.willRemove).toEqual(
      expect.arrayContaining([
        'partie zapasu',
        'wartości odżywcze',
        'produkt z katalogu',
      ]),
    );
    expect(preview.body.remainingStockQuantity).toBe('450.000');

    const undone = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${intake.product.id}/undo-addition`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(undone.status).toBe(200);
    expect((undone.body as { undone: boolean }).undone).toBe(true);

    const gone = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "Product" WHERE id = $1',
      [intake.product.id],
    );
    expect(Number(gone[0]?.count)).toBe(0);

    const nutritionGone = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "ProductNutrition" WHERE "productId" = $1',
      [intake.product.id],
    );
    expect(Number(nutritionGone[0]?.count)).toBe(0);

    const stockGone = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "StockItem" WHERE "productId" = $1',
      [intake.product.id],
    );
    expect(Number(stockGone[0]?.count)).toBe(0);
  });

  it('after consume → preview archive and undo returns 409', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenId = await createKitchen(owner, 'Undo po zużyciu');
    const intake = await intakeNewProduct(
      kitchenId,
      owner.cookies,
      'Mleko Zużyte',
    );

    const previewConsume = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${intake.product.id}/consume/preview`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { quantity: '50.000' },
      },
    );
    expect(previewConsume.status).toBe(201);
    const fingerprint = (previewConsume.body as { previewFingerprint: string })
      .previewFingerprint;

    const consumed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${intake.product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '50.000',
          idempotencyKey: `undo-c-${crypto.randomUUID()}`,
          previewFingerprint: fingerprint,
        },
      },
    );
    expect(consumed.status).toBe(201);

    const preview = await removalPreview(
      kitchenId,
      intake.product.id,
      owner.cookies,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.mode).toBe('archive');
    expect(preview.body.canUndo).toBe(false);
    expect(preview.body.canArchive).toBe(true);
    expect(preview.body.canWriteOffAndArchive).toBe(true);
    expect(preview.body.reason).toMatch(/zużyć/i);

    const undo = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${intake.product.id}/undo-addition`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(undo.status).toBe(409);
    expect(JSON.stringify(undo.body)).not.toMatch(/prisma|P2003|Foreign key/i);
  });

  it('batch from purchase checkout → cannot undo', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenId = await createKitchen(owner, 'Undo zakup');
    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Pomidory Zakup', defaultUnit: 'gram' },
      },
    );
    expect(productRes.status).toBe(201);
    const productId = (productRes.body as { id: string }).id;

    const mode = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { purchaseMode: 'exact' },
      },
    );
    expect(mode.status).toBe(200);

    const pending = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId,
          plannedQuantity: '500.000',
          plannedUnit: 'gram',
        },
      },
    );
    expect(pending.status).toBe(201);
    const pendingItemId = (pending.body as { id: string }).id;

    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/shopping-list/items/${pendingItemId}/status`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { status: 'bought' },
      },
    );

    const checkout = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/purchases/checkout`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          idempotencyKey: `undo-co-${crypto.randomUUID()}`,
          storeName: 'Biedronka',
          currency: 'PLN',
          lines: [
            {
              shoppingListItemId: pendingItemId,
              productId,
              quantity: '500.000',
              inputUnit: 'gram',
              priceMinor: 499,
              location: 'pantry',
            },
          ],
        },
      },
    );
    expect(checkout.status).toBe(201);

    const preview = await removalPreview(kitchenId, productId, owner.cookies);
    expect(preview.status).toBe(200);
    expect(preview.body.mode).toBe('archive');
    expect(preview.body.canUndo).toBe(false);
    expect(preview.body.willKeep).toContain('zakupy i paragony');
    expect(preview.body.reason).toMatch(/zakup/i);

    const undo = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/undo-addition`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(undo.status).toBe(409);
  });

  it('recipe ingredient link → cannot undo', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenId = await createKitchen(owner, 'Undo przepis');
    const intake = await intakeNewProduct(
      kitchenId,
      owner.cookies,
      'Cukier Przepis',
    );

    const recipe = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          name: 'Ciasto',
          servings: 2,
          difficulty: 'easy',
          visibility: 'private',
          ingredients: [
            {
              name: 'Cukier Przepis',
              quantity: '100.000',
              unit: 'gram',
              sortOrder: 0,
              productId: intake.product.id,
            },
          ],
          steps: [{ instruction: 'Mieszaj', sortOrder: 0 }],
        },
      },
    );
    expect(recipe.status).toBe(201);

    const preview = await removalPreview(
      kitchenId,
      intake.product.id,
      owner.cookies,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.mode).toBe('archive');
    expect(preview.body.canUndo).toBe(false);
    expect(preview.body.willKeep).toContain('powiązania z przepisami');
    expect(preview.body.reason).toMatch(/przepis/i);

    const undo = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${intake.product.id}/undo-addition`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(undo.status).toBe(409);
  });

  it('kitchen isolation returns 404/400 style errors', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const stranger = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenId = await createKitchen(owner, 'Undo izolacja');
    const otherKitchenId = await createKitchen(stranger, 'Obca kuchnia undo');
    const intake = await intakeNewProduct(
      kitchenId,
      owner.cookies,
      'Izolowany Produkt',
    );

    const foreignKitchen = await removalPreview(
      kitchenId,
      intake.product.id,
      stranger.cookies,
    );
    expect(foreignKitchen.status).toBe(404);

    const wrongKitchen = await removalPreview(
      otherKitchenId,
      intake.product.id,
      stranger.cookies,
    );
    expect(wrongKitchen.status).toBe(400);

    const undoForeign = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${intake.product.id}/undo-addition`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: stranger.cookies,
      },
    );
    expect(undoForeign.status).toBe(404);

    const undoWrongKitchen = await apiFetch(
      api.origin,
      `/api/kitchens/${otherKitchenId}/products/${intake.product.id}/undo-addition`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: stranger.cookies,
      },
    );
    expect(undoWrongKitchen.status).toBe(400);
  });
});
