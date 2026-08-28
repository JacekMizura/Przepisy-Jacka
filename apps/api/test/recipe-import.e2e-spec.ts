import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
  type TestUser,
} from './create-api-app';
import { closeTestPool } from './pg-client';

jest.setTimeout(120_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';

type KitchenRef = { id: string };
type Preview = {
  sourceUrl: string;
  importIdempotencyKey: string;
  importedAt: string;
  candidates: Array<{
    name: string;
    servings: number | null;
    servingsAmbiguous: boolean;
    ingredients: Array<{
      rawText: string;
      name: string;
      quantity: string | null;
      unit: string | null;
      suggestedProductId: string | null;
    }>;
    suggestedCategoryIds: string[];
    unmatchedSourceCategories: string[];
  }>;
  existingFromSameSource: Array<{ id: string; name: string }>;
};

describe('Recipe URL import (e2e)', () => {
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

  it('previews JSON-LD without saving and maps products/categories', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Import kuchnia');

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
    expect(productRes.status).toBe(201);
    const product = productRes.body as { id: string };

    const categories = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipe-categories`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(categories.status).toBe(200);

    const previewRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/import/preview`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { url: 'https://recipe-import.test/basic' },
      },
    );
    expect(previewRes.status).toBe(200);
    const preview = previewRes.body as Preview;
    expect(preview.candidates).toHaveLength(1);
    expect(preview.candidates[0]?.name).toBe('Omlet klasyczny');
    expect(preview.candidates[0]?.servings).toBe(2);
    expect(
      preview.candidates[0]?.ingredients.some(
        (item) => item.suggestedProductId === product.id,
      ),
    ).toBe(true);
    expect(preview.candidates[0]?.suggestedCategoryIds.length).toBeGreaterThan(
      0,
    );
    expect(preview.candidates[0]?.unmatchedSourceCategories).toContain(
      'Kuchnia fusion',
    );

    const listBefore = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(listBefore.status).toBe(200);
    expect(listBefore.body as unknown[]).toHaveLength(0);
  });

  it('supports multiple candidates and ambiguous servings; commit is idempotent', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Import multi');

    const previewRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/import/preview`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { url: 'https://recipe-import.test/multi' },
      },
    );
    expect(previewRes.status).toBe(200);
    const preview = previewRes.body as Preview;
    expect(preview.candidates).toHaveLength(2);
    const salad = preview.candidates.find(
      (item) => item.name === 'Sałatka grecka',
    );
    expect(salad?.servingsAmbiguous).toBe(true);
    expect(salad?.servings).toBeNull();

    const candidate = preview.candidates[0]!;
    const createBody = {
      name: candidate.name,
      description: null,
      servings: candidate.servings ?? 1,
      difficulty: 'easy',
      visibility: 'private',
      sourceUrl: preview.sourceUrl,
      sourceAuthor: 'Autor źródła',
      importedAt: preview.importedAt,
      importIdempotencyKey: preview.importIdempotencyKey,
      categoryIds: candidate.suggestedCategoryIds,
      ingredients: candidate.ingredients.map((item, index) => ({
        name: item.name || item.rawText,
        quantity: item.quantity,
        unit: item.unit ?? 'to_taste',
        note: item.rawText,
        productId: item.suggestedProductId,
        sortOrder: index,
      })),
      steps: [{ instruction: 'Krok testowy', sortOrder: 0 }],
    };

    const first = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: createBody,
      },
    );
    expect(first.status).toBe(201);
    const firstRecipe = first.body as { id: string; sourceUrl: string | null };

    const second = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: createBody,
      },
    );
    expect(second.status).toBe(201);
    expect((second.body as { id: string }).id).toBe(firstRecipe.id);

    const list = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect((list.body as unknown[]).length).toBe(1);

    const again = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/import/preview`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { url: 'https://recipe-import.test/multi' },
      },
    );
    expect(again.status).toBe(200);
    expect(
      (again.body as Preview).existingFromSameSource.some(
        (item) => item.id === firstRecipe.id,
      ),
    ).toBe(true);
  });

  it('rejects empty JSON-LD, SSRF hosts and unauthenticated access', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Import security');

    const empty = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/import/preview`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { url: 'https://recipe-import.test/empty' },
      },
    );
    expect(empty.status).toBe(400);

    const ssrf = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/import/preview`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { url: 'https://127.0.0.1/secret' },
      },
    );
    expect(ssrf.status).toBe(400);

    const anon = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/import/preview`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        body: { url: 'https://recipe-import.test/basic' },
      },
    );
    expect(anon.status).toBe(401);
  });
});
