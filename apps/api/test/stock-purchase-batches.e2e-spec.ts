import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
} from './create-api-app';
import { closeTestPool } from './pg-client';

jest.setTimeout(90_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';

type StockSummary = {
  productId: string;
  totalQuantity: string;
  batchCount: number;
  batches: Array<{
    id: string;
    quantity: string;
    purchasePriceMinor: number | null;
    storeName: string | null;
    purchaseId: string | null;
  }>;
};

type ConsumePreview = {
  previewFingerprint: string;
  quantity: string;
  totalCostMinor: number | null;
  costComplete: boolean;
  insufficientQuantity: string | null;
  lines: Array<{
    stockItemId: string;
    quantity: string;
    costMinor: number | null;
  }>;
};

type ConsumptionResult = {
  id: string;
  totalQuantity: string;
  totalCostMinor: number | null;
  costComplete: boolean;
  lines: Array<{
    stockItemId: string;
    quantity: string;
    costMinor: number | null;
  }>;
};

describe('Stock purchase batches and consumption (e2e)', () => {
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

  async function createKitchenWithTomatoes(ownerCookies: Map<string, string>) {
    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: ownerCookies,
      body: { name: 'Partie' },
    });
    const kitchen = kitchenRes.body as { id: string };

    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: ownerCookies,
        body: { name: 'Pomidory malinowe', defaultUnit: 'gram' },
      },
    );
    const product = productRes.body as { id: string };
    return { kitchen, product };
  }

  async function createBatch(
    kitchenId: string,
    cookies: Map<string, string>,
    body: {
      productId: string;
      quantity: string;
      purchasePriceMinor?: number;
      expiresAt?: string;
      purchasedAt?: string;
    },
  ) {
    const res = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/stock-items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies,
        body: {
          location: 'fridge',
          ...body,
        },
      },
    );
    expect(res.status).toBe(201);
    return res.body as {
      id: string;
      quantity: string;
      initialQuantity: string;
    };
  }

  it('groups two store batches under one product with distinct prices', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const { kitchen, product } = await createKitchenWithTomatoes(owner.cookies);

    const biedronka = await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '500.000',
      purchasePriceMinor: 400,
      expiresAt: '2026-08-30T00:00:00.000Z',
      purchasedAt: '2026-08-20T00:00:00.000Z',
    });
    const carrefour = await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '1000.000',
      purchasePriceMinor: 1000,
      expiresAt: '2026-09-01T00:00:00.000Z',
      purchasedAt: '2026-08-22T00:00:00.000Z',
    });

    const summaryRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(summaryRes.status).toBe(200);
    const summaries = summaryRes.body as StockSummary[];
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.productId).toBe(product.id);
    expect(summaries[0]?.totalQuantity).toBe('1500.000');
    expect(summaries[0]?.batchCount).toBe(2);
    expect(summaries[0]?.batches.map((b) => b.id).sort()).toEqual(
      [biedronka.id, carrefour.id].sort(),
    );
    expect(
      summaries[0]?.batches.find((b) => b.id === biedronka.id)
        ?.purchasePriceMinor,
    ).toBe(400);
    expect(
      summaries[0]?.batches.find((b) => b.id === carrefour.id)
        ?.purchasePriceMinor,
    ).toBe(1000);
  });

  it('consumes across batches by expiry with cost 5 zł and idempotent commit', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const { kitchen, product } = await createKitchenWithTomatoes(owner.cookies);

    const biedronka = await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '500.000',
      purchasePriceMinor: 400,
      expiresAt: '2026-08-30T00:00:00.000Z',
    });
    await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '1000.000',
      purchasePriceMinor: 1000,
      expiresAt: '2026-09-01T00:00:00.000Z',
    });

    const previewRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume/preview`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { quantity: '600.000' },
      },
    );
    expect(previewRes.status).toBe(201);
    const preview = previewRes.body as ConsumePreview;
    expect(preview.insufficientQuantity).toBeNull();
    expect(preview.totalCostMinor).toBe(500);
    expect(preview.costComplete).toBe(true);
    expect(preview.lines).toHaveLength(2);
    expect(preview.lines[0]).toMatchObject({
      stockItemId: biedronka.id,
      quantity: '500.000',
      costMinor: 400,
    });
    expect(preview.lines[1]).toMatchObject({
      quantity: '100.000',
      costMinor: 100,
    });

    const idempotencyKey = `consume-${crypto.randomUUID()}`;
    const commitBody = {
      quantity: '600.000',
      idempotencyKey,
      previewFingerprint: preview.previewFingerprint,
    };
    const commitRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: commitBody,
      },
    );
    expect(commitRes.status).toBe(201);
    const consumption = commitRes.body as ConsumptionResult;
    expect(consumption.totalCostMinor).toBe(500);

    const commitAgain = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: commitBody,
      },
    );
    expect(commitAgain.status).toBe(201);
    expect((commitAgain.body as ConsumptionResult).id).toBe(consumption.id);

    const summaryAfter = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const summary = (summaryAfter.body as StockSummary[])[0];
    expect(summary?.totalQuantity).toBe('900.000');
    expect(summary?.batchCount).toBe(1);
    expect(summary?.batches[0]?.quantity).toBe('900.000');
  });

  it('rejects stale fingerprint and restores stock on reversal', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const { kitchen, product } = await createKitchenWithTomatoes(owner.cookies);

    await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '200.000',
      purchasePriceMinor: 200,
    });

    const previewRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume/preview`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { quantity: '50.000' },
      },
    );
    const preview = previewRes.body as ConsumePreview;

    const staleCommit = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '50.000',
          idempotencyKey: `stale-${crypto.randomUUID()}`,
          previewFingerprint: 'invalid-fingerprint',
        },
      },
    );
    expect(staleCommit.status).toBe(409);

    const commitRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '50.000',
          idempotencyKey: `ok-${crypto.randomUUID()}`,
          previewFingerprint: preview.previewFingerprint,
        },
      },
    );
    expect(commitRes.status).toBe(201);
    const consumption = commitRes.body as ConsumptionResult;

    const reverseKey = `reverse-${crypto.randomUUID()}`;
    const reverseRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-consumptions/${consumption.id}/reverse`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: reverseKey },
      },
    );
    expect(reverseRes.status).toBe(201);

    const reverseAgain = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-consumptions/${consumption.id}/reverse`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: reverseKey },
      },
    );
    expect(reverseAgain.status).toBe(201);
    expect((reverseAgain.body as ConsumptionResult).id).toBe(
      (reverseRes.body as ConsumptionResult).id,
    );

    const summaryAfter = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect((summaryAfter.body as StockSummary[])[0]?.totalQuantity).toBe(
      '200.000',
    );
  });

  it('isolates stock summary between kitchens', async () => {
    const ownerA = await signUpUser(api.origin, WEB_ORIGIN);
    const ownerB = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenA = await createKitchenWithTomatoes(ownerA.cookies);
    const kitchenB = await createKitchenWithTomatoes(ownerB.cookies);

    await createBatch(kitchenA.kitchen.id, ownerA.cookies, {
      productId: kitchenA.product.id,
      quantity: '100.000',
    });

    const listedB = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenB.kitchen.id}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: ownerB.cookies },
    );
    expect(listedB.status).toBe(200);
    expect(listedB.body).toEqual([]);
  });

  it('does not duplicate stock batches on repeated checkout', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Checkout batches' },
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

    const itemRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          productId: product.id,
          plannedQuantity: '200.000',
          plannedUnit: 'gram',
        },
      },
    );
    const item = itemRes.body as { id: string };

    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/shopping-list/items/${item.id}/status`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { status: 'bought' },
      },
    );

    const checkoutKey = `checkout-batches-${crypto.randomUUID()}`;
    const checkoutBody = {
      idempotencyKey: checkoutKey,
      storeName: 'Biedronka',
      currency: 'PLN',
      lines: [
        {
          shoppingListItemId: item.id,
          quantity: '200.000',
          inputUnit: 'gram',
          location: 'fridge',
          priceMinor: 800,
          productId: product.id,
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
    expect((checkoutAgain.body as { id: string }).id).toBe(
      (checkout.body as { id: string }).id,
    );

    const summaryRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const summaries = summaryRes.body as StockSummary[];
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.batchCount).toBe(1);
    expect(summaries[0]?.totalQuantity).toBe('200.000');
    expect(summaries[0]?.batches[0]?.storeName).toBe('Biedronka');
    expect(summaries[0]?.batches[0]?.purchaseId).toBeTruthy();
  });

  it('supports manual batch selection and rejects commit with swapped lines', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const { kitchen, product } = await createKitchenWithTomatoes(owner.cookies);
    const a = await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '300.000',
      purchasePriceMinor: 300,
      expiresAt: '2026-09-01T00:00:00.000Z',
    });
    const b = await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '300.000',
      purchasePriceMinor: 600,
      expiresAt: '2026-09-10T00:00:00.000Z',
    });

    const preview = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume/preview`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '100.000',
          manualLines: [{ stockItemId: b.id, quantity: '100.000' }],
        },
      },
    );
    expect(preview.status).toBe(201);
    const previewBody = preview.body as ConsumePreview;
    expect(previewBody.lines).toHaveLength(1);
    expect(previewBody.lines[0]?.stockItemId).toBe(b.id);
    expect(previewBody.totalCostMinor).toBe(200);

    const swappedCommit = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '100.000',
          idempotencyKey: `swap-${crypto.randomUUID()}`,
          previewFingerprint: previewBody.previewFingerprint,
          manualLines: [{ stockItemId: a.id, quantity: '100.000' }],
        },
      },
    );
    expect(swappedCommit.status).toBe(409);

    const commit = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '100.000',
          idempotencyKey: `manual-${crypto.randomUUID()}`,
          previewFingerprint: previewBody.previewFingerprint,
          manualLines: [{ stockItemId: b.id, quantity: '100.000' }],
        },
      },
    );
    expect(commit.status).toBe(201);
  });

  it('lists consumptions and reverses to restore stock', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const { kitchen, product } = await createKitchenWithTomatoes(owner.cookies);
    await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '100.000',
      purchasePriceMinor: 100,
    });

    const preview = (
      await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/products/${product.id}/consume/preview`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: { quantity: '40.000' },
        },
      )
    ).body as ConsumePreview;

    const commit = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '40.000',
          idempotencyKey: `hist-${crypto.randomUUID()}`,
          previewFingerprint: preview.previewFingerprint,
        },
      },
    );
    const consumption = commit.body as ConsumptionResult;

    const listed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-consumptions?productId=${product.id}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(listed.status).toBe(200);
    const history = listed.body as Array<{
      id: string;
      isReversed: boolean;
      isReversal: boolean;
    }>;
    expect(history.some((h) => h.id === consumption.id)).toBe(true);

    const reverse = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-consumptions/${consumption.id}/reverse`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: `rev-hist-${crypto.randomUUID()}` },
      },
    );
    expect(reverse.status).toBe(201);

    const summary = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect((summary.body as StockSummary[])[0]?.totalQuantity).toBe('100.000');
  });

  it('assigns exactly 100 groszy across three piece consumptions', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Grosze' },
    });
    const kitchen = kitchenRes.body as { id: string };
    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Jajka', defaultUnit: 'piece' },
      },
    );
    const product = productRes.body as { id: string };
    await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '3.000',
      purchasePriceMinor: 100,
    });

    let totalCost = 0;
    for (let i = 0; i < 3; i += 1) {
      const preview = (
        await apiFetch(
          api.origin,
          `/api/kitchens/${kitchen.id}/products/${product.id}/consume/preview`,
          {
            method: 'POST',
            webOrigin: WEB_ORIGIN,
            cookies: owner.cookies,
            body: { quantity: '1.000' },
          },
        )
      ).body as ConsumePreview;
      const commit = await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: {
            quantity: '1.000',
            idempotencyKey: `piece-${i}-${crypto.randomUUID()}`,
            previewFingerprint: preview.previewFingerprint,
          },
        },
      );
      expect(commit.status).toBe(201);
      totalCost += (commit.body as ConsumptionResult).totalCostMinor ?? 0;
    }
    expect(totalCost).toBe(100);
  });
});
