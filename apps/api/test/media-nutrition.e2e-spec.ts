import sharp from 'sharp';

import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
  type TestUser,
} from './create-api-app';
import { closeTestPool, queryTestDb } from './pg-client';

jest.setTimeout(180_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';
const MAX_UPLOAD_BYTES = 200_000;

type KitchenRef = { id: string };
type ProductRef = { id: string; defaultUnit: string };
type RecipeRef = {
  id: string;
  steps: Array<{ id: string; sortOrder: number }>;
};
type MediaImage = {
  mediaAssetId: string;
  url: string;
  thumbnailUrl: string | null;
};
type BeginUploadResult = {
  mediaAssetId: string;
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
};

describe('Media, wartości odżywcze i koszt przepisu (e2e)', () => {
  let api: RunningApi;
  let jpegBytes: string;

  beforeAll(async () => {
    api = await startApiServer({
      CORS_ORIGINS: WEB_ORIGIN,
      PUBLIC_WEB_ORIGIN: WEB_ORIGIN,
      BETTER_AUTH_URL: WEB_ORIGIN,
      AUTH_TRUSTED_ORIGINS: WEB_ORIGIN,
      MEDIA_STORAGE_DRIVER: 'memory',
      MEDIA_MAX_UPLOAD_BYTES: String(MAX_UPLOAD_BYTES),
    });
    jpegBytes = (await createJpeg(900, 600)).toString('base64');
  });

  afterAll(async () => {
    await closeTestPool();
    api.stop();
  });

  async function createJpeg(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 180, g: 90, b: 30 },
      },
    })
      .jpeg({ quality: 60 })
      .toBuffer();
  }

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

  async function createRecipe(
    user: TestUser,
    kitchenId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<RecipeRef> {
    const response = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/recipes`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: user.cookies,
        body: {
          name: 'Omlet ze zdjęciem',
          servings: 2,
          difficulty: 'easy',
          visibility: 'private',
          ingredients: [
            { name: 'Jajka', quantity: '2.000', unit: 'piece', sortOrder: 0 },
          ],
          steps: [{ instruction: 'Ubij jajka.', sortOrder: 0 }],
          ...overrides,
        },
      },
    );
    expect(response.status).toBe(201);
    return response.body as RecipeRef;
  }

  async function beginUpload(
    user: TestUser,
    kitchenId: string,
    body: Record<string, unknown>,
  ) {
    return apiFetch(api.origin, `/api/kitchens/${kitchenId}/media/uploads`, {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: user.cookies,
      body,
    });
  }

  /** Pełny cykl: rozpoczęcie, wysyłka do magazynu w pamięci, przetworzenie. */
  async function uploadReadyAsset(
    user: TestUser,
    kitchenId: string,
    body: Record<string, unknown>,
    contentBase64: string = jpegBytes,
  ): Promise<string> {
    const begun = await beginUpload(user, kitchenId, {
      declaredMimeType: 'image/jpeg',
      declaredByteSize: 40_000,
      ...body,
    });
    expect(begun.status).toBe(201);
    const upload = begun.body as BeginUploadResult;
    expect(upload.uploadUrl).toContain(
      `/api/kitchens/${kitchenId}/media/${upload.mediaAssetId}/memory-upload`,
    );

    const sent = await apiFetch(api.origin, upload.uploadUrl, {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: user.cookies,
      body: { contentBase64 },
    });
    expect(sent.status).toBe(204);

    const completed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/media/${upload.mediaAssetId}/complete`,
      { method: 'POST', webOrigin: WEB_ORIGIN, cookies: user.cookies },
    );
    expect(completed.status).toBe(201);
    const asset = completed.body as {
      status: string;
      mimeType: string;
      width: number;
      height: number;
    };
    expect(asset.status).toBe('ready');
    expect(asset.mimeType).toBe('image/webp');
    return upload.mediaAssetId;
  }

  async function countMediaAssets(id: string): Promise<number> {
    const rows = await queryTestDb<{ count: string }>(
      'SELECT count(*)::text AS count FROM "MediaAsset" WHERE id = $1',
      [id],
    );
    return Number(rows[0]?.count ?? '0');
  }

  it('odmawia wysyłki zdjęcia w cudzej kuchni', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const outsider = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Zdjęcia obcej kuchni');

    const denied = await beginUpload(outsider, kitchen.id, {
      purpose: 'product',
      declaredMimeType: 'image/jpeg',
      declaredByteSize: 1000,
    });
    expect(denied.status).toBe(404);
  });

  it('odrzuca niedozwolony typ pliku i zbyt duży rozmiar', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Walidacja wysyłki');

    const badMime = await beginUpload(owner, kitchen.id, {
      purpose: 'product',
      declaredMimeType: 'application/pdf',
      declaredByteSize: 1000,
    });
    expect(badMime.status).toBe(400);

    const tooBig = await beginUpload(owner, kitchen.id, {
      purpose: 'product',
      declaredMimeType: 'image/png',
      declaredByteSize: MAX_UPLOAD_BYTES + 1,
    });
    expect(tooBig.status).toBe(400);
  });

  it('odrzuca zawartość, która nie jest obrazem', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Podmieniona zawartość');

    const begun = await beginUpload(owner, kitchen.id, {
      purpose: 'product',
      declaredMimeType: 'image/jpeg',
      declaredByteSize: 100,
    });
    expect(begun.status).toBe(201);
    const upload = begun.body as BeginUploadResult;

    const sent = await apiFetch(api.origin, upload.uploadUrl, {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: {
        contentBase64: Buffer.from('%PDF-1.7 to nie obraz').toString('base64'),
      },
    });
    expect(sent.status).toBe(204);

    const completed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/media/${upload.mediaAssetId}/complete`,
      { method: 'POST', webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(completed.status).toBe(400);

    const rows = await queryTestDb<{ status: string }>(
      'SELECT status::text AS status FROM "MediaAsset" WHERE id = $1',
      [upload.mediaAssetId],
    );
    expect(rows[0]?.status).toBe('failed');
  });

  it('nie pozwala przypiąć zdjęcia z innej kuchni ani zdjęcia bez przetworzenia', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenA = await createKitchen(owner, 'Kuchnia zdjęć A');
    const kitchenB = await createKitchen(owner, 'Kuchnia zdjęć B');
    const productB = await createProduct(owner, kitchenB.id, {
      name: 'Mleko B',
      defaultUnit: 'milliliter',
    });

    const foreignAssetId = await uploadReadyAsset(owner, kitchenA.id, {
      purpose: 'product',
    });
    const foreignAttach = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenB.id}/products/${productB.id}/image`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { mediaAssetId: foreignAssetId },
      },
    );
    expect(foreignAttach.status).toBe(404);

    const pending = await beginUpload(owner, kitchenB.id, {
      purpose: 'product',
      declaredMimeType: 'image/jpeg',
      declaredByteSize: 1000,
    });
    const pendingAsset = pending.body as BeginUploadResult;
    const notReadyAttach = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenB.id}/products/${productB.id}/image`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { mediaAssetId: pendingAsset.mediaAssetId },
      },
    );
    expect(notReadyAttach.status).toBe(400);
  });

  it('przypina zdjęcie produktu, podmienia je i sprząta osierocone pliki', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Zdjęcia produktów');
    const product = await createProduct(owner, kitchen.id, {
      name: 'Mleko',
      defaultUnit: 'milliliter',
    });

    const firstAssetId = await uploadReadyAsset(owner, kitchen.id, {
      purpose: 'product',
      target: { productId: product.id },
    });
    const attached = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/image`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { mediaAssetId: firstAssetId },
      },
    );
    expect(attached.status).toBe(201);
    const attachedBody = attached.body as { image: MediaImage };
    expect(attachedBody.image.mediaAssetId).toBe(firstAssetId);
    expect(attachedBody.image.thumbnailUrl).not.toBeNull();

    const list = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(list.status).toBe(200);
    const listed = (
      list.body as Array<{ id: string; image: MediaImage | null }>
    ).find((item) => item.id === product.id);
    expect(listed?.image?.mediaAssetId).toBe(firstAssetId);

    const secondAssetId = await uploadReadyAsset(owner, kitchen.id, {
      purpose: 'product',
    });
    const replaced = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/image`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { mediaAssetId: secondAssetId },
      },
    );
    expect(replaced.status).toBe(201);
    expect((replaced.body as { image: MediaImage }).image.mediaAssetId).toBe(
      secondAssetId,
    );
    expect(await countMediaAssets(firstAssetId)).toBe(0);

    const detached = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${product.id}/image`,
      { method: 'DELETE', webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(detached.status).toBe(204);
    expect(await countMediaAssets(secondAssetId)).toBe(0);
  });

  it('chroni zdjęcia przepisów: prywatność i uprawnienia autora', async () => {
    const author = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(author, 'Zdjęcia przepisów');
    await inviteMember(author, kitchen.id, member);

    const privateRecipe = await createRecipe(author, kitchen.id);
    const deniedPrivate = await beginUpload(member, kitchen.id, {
      purpose: 'recipe_cover',
      declaredMimeType: 'image/jpeg',
      declaredByteSize: 1000,
      target: { recipeId: privateRecipe.id },
    });
    expect(deniedPrivate.status).toBe(404);

    const sharedRecipe = await createRecipe(author, kitchen.id, {
      name: 'Wspólny omlet',
      visibility: 'kitchen',
    });
    const deniedShared = await beginUpload(member, kitchen.id, {
      purpose: 'recipe_cover',
      declaredMimeType: 'image/jpeg',
      declaredByteSize: 1000,
      target: { recipeId: sharedRecipe.id },
    });
    expect(deniedShared.status).toBe(403);

    const coverAssetId = await uploadReadyAsset(author, kitchen.id, {
      purpose: 'recipe_cover',
      target: { recipeId: sharedRecipe.id },
    });
    const memberAttach = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${sharedRecipe.id}/cover`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
        body: { mediaAssetId: coverAssetId },
      },
    );
    expect(memberAttach.status).toBe(403);

    const authorAttach = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${sharedRecipe.id}/cover`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: author.cookies,
        body: { mediaAssetId: coverAssetId },
      },
    );
    expect(authorAttach.status).toBe(201);

    const stepId = sharedRecipe.steps[0]?.id ?? '';
    const stepAssetId = await uploadReadyAsset(author, kitchen.id, {
      purpose: 'recipe_step',
      target: { recipeStepId: stepId },
    });
    const stepAttach = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${sharedRecipe.id}/steps/${stepId}/image`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: author.cookies,
        body: { mediaAssetId: stepAssetId },
      },
    );
    expect(stepAttach.status).toBe(201);

    const memberDetail = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${sharedRecipe.id}`,
      { webOrigin: WEB_ORIGIN, cookies: member.cookies },
    );
    expect(memberDetail.status).toBe(200);
    const detail = memberDetail.body as {
      coverImage: MediaImage | null;
      steps: Array<{ id: string; image: MediaImage | null }>;
    };
    expect(detail.coverImage?.mediaAssetId).toBe(coverAssetId);
    expect(detail.steps[0]?.image?.mediaAssetId).toBe(stepAssetId);

    const memberDeleteAsset = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/media/${coverAssetId}`,
      { method: 'DELETE', webOrigin: WEB_ORIGIN, cookies: member.cookies },
    );
    expect(memberDeleteAsset.status).toBe(403);

    const authorDeleteRecipe = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${sharedRecipe.id}`,
      { method: 'DELETE', webOrigin: WEB_ORIGIN, cookies: author.cookies },
    );
    expect(authorDeleteRecipe.status).toBe(204);
    expect(await countMediaAssets(coverAssetId)).toBe(0);
    expect(await countMediaAssets(stepAssetId)).toBe(0);
  });

  it('zapisuje i zwraca wartości odżywcze produktu', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const outsider = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Wartości odżywcze');
    await inviteMember(owner, kitchen.id, member);
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko 2%',
      defaultUnit: 'milliliter',
    });

    const empty = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/nutrition`,
      { webOrigin: WEB_ORIGIN, cookies: member.cookies },
    );
    expect(empty.status).toBe(200);
    expect(empty.body).toBeNull();

    const saved = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/nutrition`,
      {
        method: 'PUT',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
        body: {
          baseQuantity: '100.000',
          baseUnit: 'milliliter',
          kcal: '64.000',
          proteinGrams: '3.200',
          carbsGrams: '4.700',
          fatGrams: '3.600',
          saltGrams: '0.100',
        },
      },
    );
    expect(saved.status).toBe(200);
    expect((saved.body as { kcal: string }).kcal).toBe('64.000');

    const mismatchedUnit = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/nutrition`,
      {
        method: 'PUT',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
        body: {
          baseQuantity: '100.000',
          baseUnit: 'gram',
          kcal: '64.000',
          proteinGrams: '3.200',
          carbsGrams: '4.700',
          fatGrams: '3.600',
        },
      },
    );
    expect(mismatchedUnit.status).toBe(400);

    const negative = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/nutrition`,
      {
        method: 'PUT',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
        body: {
          baseQuantity: '100.000',
          baseUnit: 'milliliter',
          kcal: '-1.000',
          proteinGrams: '3.200',
          carbsGrams: '4.700',
          fatGrams: '3.600',
        },
      },
    );
    expect(negative.status).toBe(400);

    const denied = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products/${milk.id}/nutrition`,
      { webOrigin: WEB_ORIGIN, cookies: outsider.cookies },
    );
    expect(denied.status).toBe(404);

    const products = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/products`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    const listed = (
      products.body as Array<{
        id: string;
        nutrition: { kcal: string } | null;
      }>
    ).find((item) => item.id === milk.id);
    expect(listed?.nutrition?.kcal).toBe('64.000');
  });

  it('szacuje makroskładniki i koszt przepisu z ostatnich zakupów', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Szacowanie przepisu');
    const milk = await createProduct(owner, kitchen.id, {
      name: 'Mleko szacowanie',
      defaultUnit: 'milliliter',
    });
    const eggs = await createProduct(owner, kitchen.id, {
      name: 'Jajka szacowanie',
      defaultUnit: 'piece',
    });

    await putNutrition(owner, kitchen.id, milk.id, {
      baseQuantity: '100.000',
      baseUnit: 'milliliter',
      kcal: '64.000',
      proteinGrams: '3.200',
      carbsGrams: '4.700',
      fatGrams: '3.600',
    });
    await putNutrition(owner, kitchen.id, eggs.id, {
      baseQuantity: '1.000',
      baseUnit: 'piece',
      kcal: '78.000',
      proteinGrams: '6.300',
      carbsGrams: '0.600',
      fatGrams: '5.300',
    });

    await recordPurchase(owner, kitchen.id, [
      {
        productId: milk.id,
        quantity: '1000.000',
        inputUnit: 'milliliter',
        priceMinor: 320,
      },
      {
        productId: eggs.id,
        quantity: '10.000',
        inputUnit: 'piece',
        priceMinor: 1200,
      },
    ]);

    const recipe = await createRecipe(owner, kitchen.id, {
      name: 'Omlet z mlekiem',
      servings: 2,
      ingredients: [
        {
          name: 'Mleko',
          quantity: '600.000',
          unit: 'milliliter',
          productId: milk.id,
          sortOrder: 0,
        },
        {
          name: 'Jajka',
          quantity: '4.000',
          unit: 'piece',
          productId: eggs.id,
          sortOrder: 1,
        },
        { name: 'Sól', unit: 'to_taste', sortOrder: 2 },
      ],
    });

    const estimate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/estimate?servings=2`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(estimate.status).toBe(200);
    const body = estimate.body as {
      servings: number;
      nutrition: {
        isComplete: boolean;
        countedIngredients: number;
        totalIngredients: number;
        missingIngredientNames: string[];
        recipe: { kcal: string } | null;
        perServing: { kcal: string } | null;
      };
      cost: {
        isComplete: boolean;
        recipeTotalMinor: number | null;
        perServingMinor: number | null;
        priceSources: Array<{ productId: string }>;
        note: string;
      };
    };

    expect(body.servings).toBe(2);
    // 600 ml mleka (384 kcal) + 4 jajka (312 kcal) = 696 kcal.
    expect(body.nutrition.recipe?.kcal).toBe('696.00');
    expect(body.nutrition.perServing?.kcal).toBe('348.00');
    expect(body.nutrition.countedIngredients).toBe(2);
    expect(body.nutrition.totalIngredients).toBe(3);
    expect(body.nutrition.isComplete).toBe(false);
    expect(body.nutrition.missingIngredientNames).toEqual(['Sól']);

    // 600 ml po 0,32 gr/ml = 192 gr, 4 jajka po 120 gr = 480 gr.
    expect(body.cost.recipeTotalMinor).toBe(672);
    expect(body.cost.perServingMinor).toBe(336);
    expect(body.cost.isComplete).toBe(false);
    expect(body.cost.priceSources).toHaveLength(2);
    expect(body.cost.note).toBe('Szacunkowo na podstawie ostatnich zakupów');

    const doubled = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/estimate?servings=4`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(doubled.status).toBe(200);
    expect(
      (doubled.body as { cost: { recipeTotalMinor: number } }).cost
        .recipeTotalMinor,
    ).toBe(1344);
  });

  it('nie zwraca zera, gdy brakuje danych o cenach i makro', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Brak danych szacowania');
    const recipe = await createRecipe(owner, kitchen.id, {
      name: 'Przepis bez danych',
      ingredients: [
        { name: 'Sól', unit: 'to_taste', sortOrder: 0 },
        { name: 'Woda', quantity: '1.000', unit: 'cup', sortOrder: 1 },
      ],
    });

    const estimate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}/estimate?servings=2`,
      { webOrigin: WEB_ORIGIN, cookies: owner.cookies },
    );
    expect(estimate.status).toBe(200);
    const body = estimate.body as {
      nutrition: { recipe: unknown; perServing: unknown; isComplete: boolean };
      cost: { recipeTotalMinor: unknown; perServingMinor: unknown };
    };
    expect(body.nutrition.recipe).toBeNull();
    expect(body.nutrition.perServing).toBeNull();
    expect(body.nutrition.isComplete).toBe(false);
    expect(body.cost.recipeTotalMinor).toBeNull();
    expect(body.cost.perServingMinor).toBeNull();
  });

  async function putNutrition(
    user: TestUser,
    kitchenId: string,
    productId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const response = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/products/${productId}/nutrition`,
      { method: 'PUT', webOrigin: WEB_ORIGIN, cookies: user.cookies, body },
    );
    expect(response.status).toBe(200);
  }

  /** Zakup przez prawdziwy przepływ listy zakupów, żeby powstały linie zakupu. */
  async function recordPurchase(
    user: TestUser,
    kitchenId: string,
    lines: Array<{
      productId: string;
      quantity: string;
      inputUnit: string;
      priceMinor: number;
    }>,
  ): Promise<void> {
    const checkoutLines: Array<Record<string, unknown>> = [];
    for (const line of lines) {
      const created = await apiFetch(
        api.origin,
        `/api/kitchens/${kitchenId}/shopping-list/items`,
        {
          method: 'POST',
          webOrigin: WEB_ORIGIN,
          cookies: user.cookies,
          body: {
            productId: line.productId,
            plannedQuantity: line.quantity,
            plannedUnit: line.inputUnit,
          },
        },
      );
      expect(created.status).toBe(201);
      const item = created.body as { id: string };

      const bought = await apiFetch(
        api.origin,
        `/api/kitchens/${kitchenId}/shopping-list/items/${item.id}/status`,
        {
          method: 'PATCH',
          webOrigin: WEB_ORIGIN,
          cookies: user.cookies,
          body: { status: 'bought' },
        },
      );
      expect(bought.status).toBe(200);

      checkoutLines.push({
        shoppingListItemId: item.id,
        quantity: line.quantity,
        inputUnit: line.inputUnit,
        location: 'pantry',
        priceMinor: line.priceMinor,
        productId: line.productId,
      });
    }

    const checkout = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/purchases/checkout`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: user.cookies,
        body: {
          idempotencyKey: `checkout-${crypto.randomUUID()}`,
          storeName: 'Test',
          lines: checkoutLines,
        },
      },
    );
    expect(checkout.status).toBe(201);
  }
});
