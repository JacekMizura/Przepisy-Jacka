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

type KitchenRef = { id: string };
type RecipeRef = {
  id: string;
  categories?: Array<{ id: string; name: string }>;
};
type CategoryRef = { id: string; name: string };

describe('Recipe categories (e2e)', () => {
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

  function sampleRecipeBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Omlet',
      description: 'Prosty omlet',
      servings: 2,
      difficulty: 'easy',
      visibility: 'private',
      ingredients: [
        {
          name: 'Jajka',
          quantity: '2.000',
          unit: 'piece',
          sortOrder: 0,
        },
      ],
      steps: [{ instruction: 'Ubij jajka.', sortOrder: 0 }],
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

  async function listCategories(
    user: TestUser,
    kitchenId: string,
  ): Promise<CategoryRef[]> {
    const response = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenId}/recipe-categories`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: user.cookies,
      },
    );
    expect(response.status).toBe(200);
    return response.body as CategoryRef[];
  }

  it('seeds default categories for new kitchens without duplicates', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Kategorie startowe');
    const categories = await listCategories(owner, kitchen.id);
    expect(categories.map((item) => item.name)).toEqual([
      'Śniadania',
      'Dania główne',
      'Zupy',
      'Sałatki',
      'Desery',
      'Wypieki',
      'Sosy',
      'Przetwory',
    ]);

    const again = await listCategories(owner, kitchen.id);
    expect(again).toHaveLength(8);
  });

  it('does not recreate a deliberately deleted default category', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Usunięta startowa');
    const categories = await listCategories(owner, kitchen.id);
    const breakfast = categories.find((item) => item.name === 'Śniadania');
    expect(breakfast).toBeDefined();

    const removed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipe-categories/${breakfast!.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(removed.status).toBe(204);

    const afterList = await listCategories(owner, kitchen.id);
    expect(afterList.map((item) => item.name)).not.toContain('Śniadania');
    expect(afterList).toHaveLength(7);

    const afterCreate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipe-categories`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'Grill' },
      },
    );
    expect(afterCreate.status).toBe(201);

    const finalList = await listCategories(owner, kitchen.id);
    expect(finalList.map((item) => item.name)).not.toContain('Śniadania');
    expect(finalList.map((item) => item.name)).toContain('Grill');
  });

  it('lets kitchen members manage categories and rejects duplicates', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Zarządzanie kategoriami');
    await inviteMember(owner, kitchen.id, member);

    const created = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipe-categories`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
        body: { name: '  Grill  ' },
      },
    );
    expect(created.status).toBe(201);
    const category = created.body as CategoryRef;
    expect(category.name).toBe('Grill');

    const duplicate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipe-categories`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { name: 'grill' },
      },
    );
    expect(duplicate.status).toBe(409);

    const renamed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipe-categories/${category.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
        body: { name: 'Na grilla' },
      },
    );
    expect(renamed.status).toBe(200);
    expect((renamed.body as CategoryRef).name).toBe('Na grilla');
  });

  it('supports multiple category assignments and delete without losing recipes', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Przypisania kategorii');
    const categories = await listCategories(owner, kitchen.id);
    const breakfast = categories.find((item) => item.name === 'Śniadania');
    const desserts = categories.find((item) => item.name === 'Desery');
    expect(breakfast).toBeDefined();
    expect(desserts).toBeDefined();

    const recipe = await createRecipe(owner, kitchen.id, {
      ...sampleRecipeBody({ name: 'Placek' }),
      categoryIds: [breakfast!.id, desserts!.id],
    });
    expect(recipe.categories?.map((item) => item.id).sort()).toEqual(
      [breakfast!.id, desserts!.id].sort(),
    );

    const removed = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipe-categories/${desserts!.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(removed.status).toBe(204);

    const detail = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes/${recipe.id}`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(detail.status).toBe(200);
    const body = detail.body as RecipeRef;
    expect(body.id).toBe(recipe.id);
    expect(body.categories?.map((item) => item.id)).toEqual([breakfast!.id]);

    const rows = await queryTestDb<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "Recipe" WHERE id = $1`,
      [recipe.id],
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('filters by any selected category with search, and keeps privacy', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchen = await createKitchen(owner, 'Filtry kategorii');
    await inviteMember(owner, kitchen.id, member);
    const categories = await listCategories(owner, kitchen.id);
    const soups = categories.find((item) => item.name === 'Zupy')!;
    const salads = categories.find((item) => item.name === 'Sałatki')!;

    const visibleSoup = await createRecipe(owner, kitchen.id, {
      ...sampleRecipeBody({ name: 'Zupa pomidorowa', visibility: 'kitchen' }),
      categoryIds: [soups.id],
    });
    await createRecipe(owner, kitchen.id, {
      ...sampleRecipeBody({ name: 'Zupa tajna', visibility: 'private' }),
      categoryIds: [soups.id],
    });
    await createRecipe(owner, kitchen.id, {
      ...sampleRecipeBody({ name: 'Sałatka grecka', visibility: 'kitchen' }),
      categoryIds: [salads.id],
    });
    await createRecipe(owner, kitchen.id, {
      ...sampleRecipeBody({
        name: 'Chleb bez kategorii',
        visibility: 'kitchen',
      }),
    });

    const anyMatch = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes?categoryIds=${soups.id}&categoryIds=${salads.id}`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
      },
    );
    expect(anyMatch.status).toBe(200);
    const anyRecipes = anyMatch.body as Array<{ id: string; name: string }>;
    expect(anyRecipes.map((item) => item.name).sort()).toEqual([
      'Sałatka grecka',
      'Zupa pomidorowa',
    ]);

    const withSearch = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes?categoryIds=${soups.id}&search=pomidor`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
      },
    );
    expect(withSearch.status).toBe(200);
    expect(
      (withSearch.body as Array<{ id: string }>).map((item) => item.id),
    ).toEqual([visibleSoup.id]);

    const uncategorized = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/recipes?uncategorized=true`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
      },
    );
    expect(uncategorized.status).toBe(200);
    expect(
      (uncategorized.body as Array<{ name: string }>).map((item) => item.name),
    ).toEqual(['Chleb bez kategorii']);
  });

  it('keeps kitchen isolation and author-only category assignment edits', async () => {
    const ownerA = await signUpUser(api.origin, WEB_ORIGIN);
    const ownerB = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const kitchenA = await createKitchen(ownerA, 'Kuchnia A');
    const kitchenB = await createKitchen(ownerB, 'Kuchnia B');
    await inviteMember(ownerA, kitchenA.id, member);

    const categoriesA = await listCategories(ownerA, kitchenA.id);
    const categoriesB = await listCategories(ownerB, kitchenB.id);
    const breakfastA = categoriesA.find((item) => item.name === 'Śniadania')!;
    const breakfastB = categoriesB.find((item) => item.name === 'Śniadania')!;

    const recipe = await createRecipe(ownerA, kitchenA.id, {
      ...sampleRecipeBody({ name: 'Tosty', visibility: 'kitchen' }),
      categoryIds: [breakfastA.id],
    });

    const crossKitchen = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/recipes/${recipe.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: ownerA.cookies,
        body: { categoryIds: [breakfastB.id] },
      },
    );
    expect(crossKitchen.status).toBe(400);

    const memberUpdate = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenA.id}/recipes/${recipe.id}`,
      {
        method: 'PATCH',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
        body: { categoryIds: [] },
      },
    );
    expect(memberUpdate.status).toBe(403);

    const foreignList = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchenB.id}/recipes?categoryIds=${breakfastA.id}`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: ownerB.cookies,
      },
    );
    expect(foreignList.status).toBe(400);
  });
});
