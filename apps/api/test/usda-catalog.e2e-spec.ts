import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
  type TestUser,
} from './create-api-app';

const WEB_ORIGIN = 'http://127.0.0.1:3010';

describe('USDA generic food catalog (e2e)', () => {
  let api: RunningApi;
  let user: TestUser;
  let kitchenId: string;
  let otherKitchenId: string;

  beforeAll(async () => {
    api = await startApiServer();
    user = await signUpUser(api.origin, WEB_ORIGIN, {
      email: `usda.${Date.now()}@example.com`,
      password: 'DemoHaslo123!',
      name: 'USDA Tester',
    });
    const kitchen = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      cookies: user.cookies,
      body: { name: 'Kuchnia USDA' },
      webOrigin: WEB_ORIGIN,
    });
    expect(kitchen.status).toBe(201);
    kitchenId = (kitchen.body as { id: string }).id;

    const otherUser = await signUpUser(api.origin, WEB_ORIGIN, {
      email: `usda.other.${Date.now()}@example.com`,
      password: 'DemoHaslo123!',
      name: 'Other',
    });
    const otherKitchen = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      cookies: otherUser.cookies,
      body: { name: 'Obca kuchnia' },
      webOrigin: WEB_ORIGIN,
    });
    otherKitchenId = (otherKitchen.body as { id: string }).id;
  }, 90_000);

  afterAll(() => {
    api?.stop();
  });

  it('wyszukuje po polsku z aliasami i rozróżnia warianty', async () => {
    const res = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods?q=${encodeURIComponent('jabłko')}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(res.status).toBe(200);
    const body = res.body as {
      total: number;
      items: Array<{ polishName: string; variantLabel: string; fdcId: number }>;
    };
    expect(body.total).toBeGreaterThan(1);
    const names = body.items.map((i) => i.polishName.toLowerCase());
    expect(names.some((n) => n.includes('jabłko'))).toBe(true);
    const variants = new Set(body.items.map((i) => i.variantLabel));
    expect(variants.size).toBeGreaterThan(1);

    const folded = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods?q=${encodeURIComponent('jablko')}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(folded.status).toBe(200);
    expect((folded.body as { total: number }).total).toBeGreaterThan(0);
  });

  it('blokuje dostęp bez członkostwa w kuchni', async () => {
    const res = await apiFetch(
      api.origin,
      `/api/kitchens/${otherKitchenId}/usda-foods?q=pomidor`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('suggest g/kg/piece i blokuje ml; zapis USDA nie tworzy produktu katalogowego', async () => {
    const search = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods?q=${encodeURIComponent('pomidor')}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    const item = (
      search.body as {
        items: Array<{ id: string; polishName: string }>;
      }
    ).items[0]!;

    const detail = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods/${item.id}`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(detail.status).toBe(200);

    const forG = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods/${item.id}/suggest?productUnit=gram`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(forG.status).toBe(200);
    const gBody = forG.body as {
      suggested: {
        baseUnit: string;
        baseQuantity: string;
        kcal: string;
        sourceGenericFoodId: string;
        sourceFdcId: number;
        sourceFetchedAt: string;
        sourceLabel: string;
        proteinGrams: string;
        carbsGrams: string;
        fatGrams: string;
        fiberGrams: string | null;
        saltGrams: string | null;
      };
      disclaimer: string;
    };
    expect(gBody.suggested.baseUnit).toBe('gram');
    expect(gBody.disclaimer).toMatch(/referencyjne/i);

    const forMl = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods/${item.id}/suggest?productUnit=milliliter`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(forMl.status).toBe(400);

    const forPieceNoMass = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods/${item.id}/suggest?productUnit=piece`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(forPieceNoMass.status).toBe(400);

    const forPiece = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods/${item.id}/suggest?productUnit=piece&pieceGrams=150`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    expect(forPiece.status).toBe(200);
    expect(
      (forPiece.body as { suggested: { sourcePieceGrams: string } }).suggested
        .sourcePieceGrams,
    ).toBe('150.000');

    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products`,
      {
        method: 'POST',
        cookies: user.cookies,
        body: {
          name: `Pomidor USDA ${Date.now()}`,
          defaultUnit: 'gram',
        },
        webOrigin: WEB_ORIGIN,
      },
    );
    expect(productRes.status).toBe(201);
    const productId = (productRes.body as { id: string }).id;

    const saved = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/nutrition`,
      {
        method: 'PUT',
        cookies: user.cookies,
        body: {
          baseQuantity: gBody.suggested.baseQuantity,
          baseUnit: gBody.suggested.baseUnit,
          kcal: gBody.suggested.kcal,
          proteinGrams: gBody.suggested.proteinGrams,
          carbsGrams: gBody.suggested.carbsGrams,
          fatGrams: gBody.suggested.fatGrams,
          fiberGrams: gBody.suggested.fiberGrams,
          saltGrams: gBody.suggested.saltGrams,
          source: 'usda_fdc',
          sourceFetchedAt: gBody.suggested.sourceFetchedAt,
          sourceLabel: gBody.suggested.sourceLabel,
          sourceGenericFoodId: gBody.suggested.sourceGenericFoodId,
          sourceFdcId: gBody.suggested.sourceFdcId,
        },
        webOrigin: WEB_ORIGIN,
      },
    );
    expect(saved.status).toBe(200);
    const nutrition = saved.body as {
      source: string;
      sourceGenericFoodId: string;
      kcal: string;
    };
    expect(nutrition.source).toBe('usda_fdc');
    expect(nutrition.sourceGenericFoodId).toBe(
      gBody.suggested.sourceGenericFoodId,
    );
    // Ochrona ProductNutrition przy ponownym migrate — usda-catalog-migrate.e2e-spec.ts
  });

  it('ręczna poprawka po USDA ustawia source=manual i czyści powiązanie katalogu', async () => {
    const search = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods?q=marchew`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    const item = (search.body as { items: Array<{ id: string }> }).items[0]!;
    const suggest = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/usda-foods/${item.id}/suggest?productUnit=gram`,
      { cookies: user.cookies, webOrigin: WEB_ORIGIN },
    );
    const s = (
      suggest.body as { suggested: Record<string, string | number | null> }
    ).suggested;

    const productRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products`,
      {
        method: 'POST',
        cookies: user.cookies,
        body: { name: `Marchew ${Date.now()}`, defaultUnit: 'gram' },
        webOrigin: WEB_ORIGIN,
      },
    );
    const productId = (productRes.body as { id: string }).id;

    await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/nutrition`,
      {
        method: 'PUT',
        cookies: user.cookies,
        body: {
          baseQuantity: s.baseQuantity,
          baseUnit: s.baseUnit,
          kcal: s.kcal,
          proteinGrams: s.proteinGrams,
          carbsGrams: s.carbsGrams,
          fatGrams: s.fatGrams,
          fiberGrams: s.fiberGrams,
          saltGrams: s.saltGrams,
          source: 'usda_fdc',
          sourceFetchedAt: s.sourceFetchedAt,
          sourceLabel: s.sourceLabel,
          sourceGenericFoodId: s.sourceGenericFoodId,
          sourceFdcId: s.sourceFdcId,
        },
        webOrigin: WEB_ORIGIN,
      },
    );

    const manual = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/nutrition`,
      {
        method: 'PUT',
        cookies: user.cookies,
        body: {
          baseQuantity: '100.000',
          baseUnit: 'gram',
          kcal: '42.000',
          proteinGrams: '1.000',
          carbsGrams: '8.000',
          fatGrams: '0.200',
          source: 'manual',
        },
        webOrigin: WEB_ORIGIN,
      },
    );
    expect(manual.status).toBe(200);
    const body = manual.body as {
      source: string;
      sourceGenericFoodId: string | null;
      sourceFdcId: number | null;
      kcal: string;
    };
    expect(body.source).toBe('manual');
    expect(body.sourceGenericFoodId).toBeNull();
    expect(body.sourceFdcId).toBeNull();
    expect(body.kcal).toBe('42.000');
  });
});
