import sharp from 'sharp';

import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
} from './create-api-app';
import { closeTestPool, queryTestDb } from './pg-client';

jest.setTimeout(120_000);

const WEB_ORIGIN = 'http://127.0.0.1:3017';

type ProductDto = {
  id: string;
  name: string;
  isArchived: boolean;
  archivedAt: string | null;
};

type StockSummary = {
  productId: string;
  isArchived: boolean;
  totalQuantity: string;
};

type ConsumePreview = {
  previewFingerprint: string;
};

describe('Product archive (e2e)', () => {
  let api: RunningApi;
  let jpegBase64: string;

  beforeAll(async () => {
    jpegBase64 = (
      await sharp({
        create: {
          width: 32,
          height: 32,
          channels: 3,
          background: { r: 200, g: 40, b: 40 },
        },
      })
        .jpeg()
        .toBuffer()
    ).toString('base64');

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
    cookies: Map<string, string>,
    name: string,
  ): Promise<string> {
    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies,
      body: { name },
    });
    expect(kitchenRes.status).toBe(201);
    return (kitchenRes.body as { id: string }).id;
  }

  async function createProduct(
    kitchenId: string,
    cookies: Map<string, string>,
    name: string,
  ): Promise<ProductDto> {
    const res = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies,
        body: { name, defaultUnit: 'gram' },
      },
    );
    expect(res.status).toBe(201);
    return res.body as ProductDto;
  }

  async function setExactMode(
    kitchenId: string,
    productId: string,
    cookies: Map<string, string>,
  ): Promise<void> {
    const mode = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies,
        body: { purchaseMode: 'exact' },
      },
    );
    expect(mode.status).toBe(200);
  }

  it('maps history-linked hard delete to 409 instead of Prisma 500', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenId = await createKitchen(owner.cookies, 'FK Restrict');
    const product = await createProduct(kitchenId, owner.cookies, 'Mleko FK');
    await setExactMode(kitchenId, product.id, owner.cookies);

    const pending = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: product.id,
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
          idempotencyKey: `fk-${crypto.randomUUID()}`,
          storeName: 'Lidl',
          currency: 'PLN',
          lines: [
            {
              shoppingListItemId: pendingItemId,
              productId: product.id,
              quantity: '500.000',
              inputUnit: 'gram',
              priceMinor: 399,
              location: 'pantry',
            },
          ],
        },
      },
    );
    expect(checkout.status).toBe(201);

    // Old cascade DELETE would hit PurchaseLineItem ON DELETE RESTRICT → P2003 → 500.
    // Archive succeeds; permanent delete stays controlled 409.
    const archived = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${product.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(archived.status).toBe(200);
    expect((archived.body as ProductDto).isArchived).toBe(true);

    const permanent = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${product.id}?permanent=true`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(permanent.status).toBe(409);
    expect(JSON.stringify(permanent.body)).not.toMatch(
      /prisma|P2003|Foreign key/i,
    );

    const stillThere = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "Product" WHERE id = $1',
      [product.id],
    );
    expect(Number(stillThere[0]?.count)).toBe(1);
  });

  it('archives with purchase+receipt, stock, consume/reverse, recipe; restores and blocks conflicts', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const other = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenId = await createKitchen(owner.cookies, 'Archiwum pełne');
    const otherKitchenId = await createKitchen(other.cookies, 'Obca kuchnia');

    const product = await createProduct(
      kitchenId,
      owner.cookies,
      'Pomidory Arch',
    );
    await createProduct(otherKitchenId, other.cookies, 'Pomidory Arch');
    await setExactMode(kitchenId, product.id, owner.cookies);

    const pending = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: product.id,
          plannedQuantity: '500.000',
          plannedUnit: 'gram',
        },
      },
    );
    expect(pending.status).toBe(201);
    const pendingItemId = (pending.body as { id: string }).id;

    const blockedPending = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${product.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(blockedPending.status).toBe(409);
    expect(JSON.stringify(blockedPending.body)).toMatch(/zakup/i);

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
          idempotencyKey: `arch-co-${crypto.randomUUID()}`,
          storeName: 'Biedronka',
          currency: 'PLN',
          lines: [
            {
              shoppingListItemId: pendingItemId,
              productId: product.id,
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
    const purchaseId = (checkout.body as { id: string }).id;

    const begun = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/media/uploads`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          purpose: 'purchase_receipt',
          declaredMimeType: 'image/jpeg',
          declaredByteSize: 40_000,
          target: { purchaseId },
        },
      },
    );
    expect(begun.status).toBe(201);
    const upload = begun.body as { mediaAssetId: string; uploadUrl: string };
    const sent = await apiFetch(api.origin, upload.uploadUrl, {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { contentBase64: jpegBase64 },
    });
    expect(sent.status).toBe(204);
    const completed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/media/${upload.mediaAssetId}/complete`,
      { method: 'POST', webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(completed.status).toBe(201);
    const attach = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/purchases/${purchaseId}/receipt`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { mediaAssetId: upload.mediaAssetId },
      },
    );
    expect([200, 201].includes(attach.status)).toBe(true);

    const extraBatch = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/stock-items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: product.id,
          quantity: '200.000',
          location: 'fridge',
          purchasePriceMinor: 200,
        },
      },
    );
    expect(extraBatch.status).toBe(201);

    const preview = (
      await apiFetch(
        api.origin,
        `/api/kitchens/${kitchenId}/products/${product.id}/consume/preview`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: { quantity: '50.000' },
        },
      )
    ).body as ConsumePreview;
    const consumed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '50.000',
          idempotencyKey: `arch-c-${crypto.randomUUID()}`,
          previewFingerprint: preview.previewFingerprint,
        },
      },
    );
    expect(consumed.status).toBe(201);
    const consumptionId = (consumed.body as { id: string }).id;

    const writeOffPreview = (
      await apiFetch(
        api.origin,
        `/api/kitchens/${kitchenId}/products/${product.id}/consume/preview`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: { quantity: '30.000' },
        },
      )
    ).body as ConsumePreview;
    const writeOff = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '30.000',
          idempotencyKey: `arch-w-${crypto.randomUUID()}`,
          previewFingerprint: writeOffPreview.previewFingerprint,
        },
      },
    );
    expect(writeOff.status).toBe(201);

    const reversed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/stock-consumptions/${consumptionId}/reverse`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: `arch-r-${crypto.randomUUID()}` },
      },
    );
    expect(reversed.status).toBe(201);

    const recipe = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          name: 'Sos',
          servings: 2,
          difficulty: 'easy',
          visibility: 'private',
          ingredients: [
            {
              name: 'Pomidory Arch',
              quantity: '100.000',
              unit: 'gram',
              sortOrder: 0,
              productId: product.id,
            },
          ],
          steps: [{ instruction: 'Gotuj', sortOrder: 0 }],
        },
      },
    );
    expect(recipe.status).toBe(201);
    const recipeId = (recipe.body as { id: string }).id;

    const archive = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${product.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(archive.status).toBe(200);
    expect((archive.body as ProductDto).isArchived).toBe(true);

    const lines = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "PurchaseLineItem" WHERE "productId" = $1',
      [product.id],
    );
    expect(Number(lines[0]?.count)).toBeGreaterThan(0);
    const consumptions = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "StockConsumption" WHERE "productId" = $1',
      [product.id],
    );
    expect(Number(consumptions[0]?.count)).toBeGreaterThan(0);
    const receipt = await queryTestDb<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "Purchase" WHERE id = $1 AND "receiptMediaId" IS NOT NULL`,
      [purchaseId],
    );
    expect(Number(receipt[0]?.count)).toBe(1);

    const active = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect((active.body as ProductDto[]).some((p) => p.id === product.id)).toBe(
      false,
    );

    const archivedList = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products?archive=archived`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(
      (archivedList.body as ProductDto[]).some((p) => p.id === product.id),
    ).toBe(true);

    const summary = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const archivedStock = (summary.body as StockSummary[]).find(
      (s) => s.productId === product.id,
    );
    expect(archivedStock?.isArchived).toBe(true);
    expect(Number(archivedStock?.totalQuantity)).toBeGreaterThan(0);

    const addBlocked = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: product.id,
          plannedQuantity: '10.000',
          plannedUnit: 'gram',
        },
      },
    );
    expect(addBlocked.status).toBe(409);

    const recreate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Pomidory Arch', defaultUnit: 'gram' },
      },
    );
    expect(recreate.status).toBe(409);
    expect(JSON.stringify(recreate.body)).toMatch(/archiwum|PRODUCT_ARCHIVED/i);

    const foreign = await apiFetch(
      api.origin,
      `/api/kitchens/${otherKitchenId}/products/${product.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: other.cookies,
      },
    );
    expect(foreign.status).toBe(400);

    const recipeGet = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/recipes/${recipeId}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(recipeGet.status).toBe(200);
    const recipeBody = recipeGet.body as {
      ingredients: Array<{ productId: string | null; name: string }>;
    };
    expect(
      recipeBody.ingredients.some(
        (ing) => ing.productId === product.id && ing.name === 'Pomidory Arch',
      ),
    ).toBe(true);

    const restored = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${product.id}/restore`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect([200, 201].includes(restored.status)).toBe(true);
    expect((restored.body as ProductDto).isArchived).toBe(false);
  });

  it('permanently deletes unused product only', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenId = await createKitchen(owner.cookies, 'Nieużyty');
    const product = await createProduct(
      kitchenId,
      owner.cookies,
      'Tylko katalog',
    );

    const removed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${product.id}?permanent=true`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(removed.status).toBe(200);
    const rows = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "Product" WHERE id = $1',
      [product.id],
    );
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it('hides archived zero-quantity products from stock-summary', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenId = await createKitchen(owner.cookies, 'Zero stock');
    const product = await createProduct(kitchenId, owner.cookies, 'Mąka zero');
    await apiFetch(api.origin, `/api/kitchens/${kitchenId}/stock-items`, {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: {
        productId: product.id,
        quantity: '10.000',
        location: 'pantry',
      },
    });
    const preview = (
      await apiFetch(
        api.origin,
        `/api/kitchens/${kitchenId}/products/${product.id}/consume/preview`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: { quantity: '10.000' },
        },
      )
    ).body as ConsumePreview;
    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '10.000',
          idempotencyKey: `zero-${crypto.randomUUID()}`,
          previewFingerprint: preview.previewFingerprint,
        },
      },
    );
    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${product.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );

    const summary = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(
      (summary.body as StockSummary[]).some((s) => s.productId === product.id),
    ).toBe(false);
  });
});
