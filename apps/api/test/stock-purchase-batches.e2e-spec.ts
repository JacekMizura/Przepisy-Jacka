import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
} from './create-api-app';
import { closeTestPool } from './pg-client';
import { flattenStockSummaryBody } from './stock-summary-helpers';

jest.setTimeout(90_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';

/** Expiry relative to now so FEFO e2e stays stable after calendar dates pass. */
function daysFromNowIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

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
    canDelete?: boolean;
    deleteBlockReason?: string | null;
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
  isReversal?: boolean;
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
      expiresAt: daysFromNowIso(7),
      purchasedAt: daysFromNowIso(-10),
    });
    const carrefour = await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '1000.000',
      purchasePriceMinor: 1000,
      expiresAt: daysFromNowIso(14),
      purchasedAt: daysFromNowIso(-8),
    });

    const summaryRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(summaryRes.status).toBe(200);
    const summaries = flattenStockSummaryBody(
      summaryRes.body,
    ) as StockSummary[];
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
      expiresAt: daysFromNowIso(7),
    });
    await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '1000.000',
      purchasePriceMinor: 1000,
      expiresAt: daysFromNowIso(14),
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
    const summary = (
      flattenStockSummaryBody(summaryAfter.body) as StockSummary[]
    )[0];
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
    expect(
      (flattenStockSummaryBody(summaryAfter.body) as StockSummary[])[0]
        ?.totalQuantity,
    ).toBe('200.000');
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
    expect(listedB.body).toEqual({
      items: [],
      page: 1,
      limit: 50,
      total: 0,
      pageCount: 0,
    });
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
    const summaries = flattenStockSummaryBody(
      summaryRes.body,
    ) as StockSummary[];
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
      expiresAt: daysFromNowIso(7),
    });
    const b = await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '300.000',
      purchasePriceMinor: 600,
      expiresAt: daysFromNowIso(21),
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
    expect(
      (flattenStockSummaryBody(summary.body) as StockSummary[])[0]
        ?.totalQuantity,
    ).toBe('100.000');
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

  it('allows deleting unused manual batch and blocks linked or used batches', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const outsider = await signUpUser(api.origin, WEB_ORIGIN);
    const { kitchen, product } = await createKitchenWithTomatoes(owner.cookies);

    const manual = await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '50.000',
      purchasePriceMinor: 50,
    });

    const summaryBefore = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const manualDetail = (
      flattenStockSummaryBody(summaryBefore.body) as StockSummary[]
    )[0]?.batches.find((b) => b.id === manual.id) as {
      canDelete?: boolean;
      deleteBlockReason?: string | null;
    };
    expect(manualDetail?.canDelete).toBe(true);
    expect(manualDetail?.deleteBlockReason ?? null).toBeNull();

    const deleted = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-items/${manual.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(deleted.status).toBe(200);

    const used = await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '80.000',
      purchasePriceMinor: 80,
    });
    const preview = (
      await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/products/${product.id}/consume/preview`,
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
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '10.000',
          idempotencyKey: `del-used-${crypto.randomUUID()}`,
          previewFingerprint: preview.previewFingerprint,
        },
      },
    );

    const blockedUsed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-items/${used.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(blockedUsed.status).toBe(409);

    const history = (
      await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/stock-consumptions?productId=${product.id}`,
        { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
      )
    ).body as ConsumptionResult[];
    const toReverse = history.find((h) => !h.isReversal);
    expect(toReverse).toBeTruthy();
    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-consumptions/${toReverse!.id}/reverse`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: `del-rev-${crypto.randomUUID()}` },
      },
    );

    const blockedAfterReverse = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-items/${used.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(blockedAfterReverse.status).toBe(409);

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
    const listItem = (
      await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/shopping-list/items`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: {
            productId: product.id,
            plannedQuantity: '25.000',
            plannedUnit: 'gram',
          },
        },
      )
    ).body as { id: string };
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
          idempotencyKey: `del-checkout-${crypto.randomUUID()}`,
          storeName: 'Lidl',
          currency: 'PLN',
          lines: [
            {
              shoppingListItemId: listItem.id,
              quantity: '25.000',
              inputUnit: 'gram',
              location: 'fridge',
              priceMinor: 250,
              productId: product.id,
            },
          ],
        },
      },
    );
    expect(checkout.status).toBe(201);
    const purchaseBatchId = (
      checkout.body as { lines: Array<{ stockItemId: string | null }> }
    ).lines[0]?.stockItemId;
    expect(purchaseBatchId).toBeTruthy();

    const blockedPurchase = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-items/${purchaseBatchId}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(blockedPurchase.status).toBe(409);

    const summaryAfter = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const purchaseBatch = (
      flattenStockSummaryBody(summaryAfter.body) as StockSummary[]
    )[0]?.batches.find((b) => b.id === purchaseBatchId) as {
      canDelete?: boolean;
    };
    expect(purchaseBatch?.canDelete).toBe(false);

    const foreignKitchen = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: outsider.cookies,
      body: { name: 'Obca' },
    });
    const otherKitchenId = (foreignKitchen.body as { id: string }).id;
    const crossKitchen = await apiFetch(
      api.origin,
      `/api/kitchens/${otherKitchenId}/stock-items/${used.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: outsider.cookies,
      },
    );
    expect([400, 404]).toContain(crossKitchen.status);

    const foreignOwner = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-items/${used.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: outsider.cookies,
      },
    );
    expect(foreignOwner.status).toBe(404);
  });

  it('write_off requires reason, persists kind/reason, reverses and is idempotent', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const outsider = await signUpUser(api.origin, WEB_ORIGIN);
    const { kitchen, product } = await createKitchenWithTomatoes(owner.cookies);
    const batchA = await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '50.000',
      purchasePriceMinor: 100,
    });
    const batchB = await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '50.000',
      purchasePriceMinor: 200,
    });

    const missingReasonPreview = (
      await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/products/${product.id}/consume/preview`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: {
            quantity: '30.000',
            manualLines: [
              { stockItemId: batchA.id, quantity: '20.000' },
              { stockItemId: batchB.id, quantity: '10.000' },
            ],
          },
        },
      )
    ).body as ConsumePreview;

    const withoutReason = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: {
          quantity: '30.000',
          kind: 'write_off',
          idempotencyKey: `wo-noreason-${crypto.randomUUID()}`,
          previewFingerprint: missingReasonPreview.previewFingerprint,
          manualLines: [
            { stockItemId: batchA.id, quantity: '20.000' },
            { stockItemId: batchB.id, quantity: '10.000' },
          ],
        },
      },
    );
    expect(withoutReason.status).toBe(400);

    const preview = (
      await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/products/${product.id}/consume/preview`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: {
            quantity: '30.000',
            manualLines: [
              { stockItemId: batchA.id, quantity: '20.000' },
              { stockItemId: batchB.id, quantity: '10.000' },
            ],
          },
        },
      )
    ).body as ConsumePreview;

    const idempotencyKey = `wo-${crypto.randomUUID()}`;
    const commitBody = {
      quantity: '30.000',
      kind: 'write_off' as const,
      reason: '  zepsute po terminie  ',
      idempotencyKey,
      previewFingerprint: preview.previewFingerprint,
      manualLines: [
        { stockItemId: batchA.id, quantity: '20.000' },
        { stockItemId: batchB.id, quantity: '10.000' },
      ],
    };

    const first = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: commitBody,
      },
    );
    expect([200, 201]).toContain(first.status);
    const consumption = first.body as ConsumptionResult & {
      kind: string;
      reason: string | null;
      lines: Array<{ stockItemId: string }>;
    };
    expect(consumption.kind).toBe('write_off');
    expect(consumption.reason).toBe('zepsute po terminie');
    expect(consumption.lines).toHaveLength(2);

    const second = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/consume`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: commitBody,
      },
    );
    expect([200, 201]).toContain(second.status);
    expect((second.body as { id: string }).id).toBe(consumption.id);

    const listed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-consumptions?productId=${product.id}`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(listed.status).toBe(200);
    const entry = (
      listed.body as Array<{ id: string; kind: string; reason: string | null }>
    ).find((row) => row.id === consumption.id);
    expect(entry?.kind).toBe('write_off');
    expect(entry?.reason).toBe('zepsute po terminie');

    const foreignKitchen = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: outsider.cookies,
      body: { name: 'Obca-odpis' },
    });
    const otherKitchenId = (foreignKitchen.body as { id: string }).id;
    const cross = await apiFetch(
      api.origin,
      `/api/kitchens/${otherKitchenId}/stock-consumptions/${consumption.id}/reverse`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: outsider.cookies,
        body: { idempotencyKey: `rev-cross-${crypto.randomUUID()}` },
      },
    );
    expect([400, 404]).toContain(cross.status);

    const reverse = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-consumptions/${consumption.id}/reverse`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { idempotencyKey: `rev-wo-${crypto.randomUUID()}` },
      },
    );
    expect([200, 201]).toContain(reverse.status);
    const reversal = reverse.body as {
      kind: string;
      reason: string | null;
      isReversal: boolean;
    };
    expect(reversal.isReversal).toBe(true);
    expect(reversal.kind).toBe('write_off');
    expect(reversal.reason).toBe('zepsute po terminie');

    const summary = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/stock-summary`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(
      (flattenStockSummaryBody(summary.body) as StockSummary[])[0]
        ?.totalQuantity,
    ).toBe('100.000');
  });

  it('consume without kind/reason still works (backward compatible)', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const { kitchen, product } = await createKitchenWithTomatoes(owner.cookies);
    await createBatch(kitchen.id, owner.cookies, {
      productId: product.id,
      quantity: '20.000',
      purchasePriceMinor: 50,
    });
    const preview = (
      await apiFetch(
        api.origin,
        `/api/kitchens/${kitchen.id}/products/${product.id}/consume/preview`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: owner.cookies,
          body: { quantity: '5.000' },
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
          quantity: '5.000',
          idempotencyKey: `legacy-${crypto.randomUUID()}`,
          previewFingerprint: preview.previewFingerprint,
        },
      },
    );
    expect([200, 201]).toContain(commit.status);
    const body = commit.body as { kind: string; reason: string | null };
    expect(body.kind).toBe('consume');
    expect(body.reason).toBeNull();
  });
});
