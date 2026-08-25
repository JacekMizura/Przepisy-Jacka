import { hashInviteToken } from '../src/common/invite-token';
import {
  apiFetch,
  signUpUser,
  startApiServer,
  type RunningApi,
} from './create-api-app';
import { closeTestPool, executeTestDb, queryTestDb } from './pg-client';

jest.setTimeout(60_000);

const WEB_ORIGIN = 'http://127.0.0.1:3010';

describe('Kitchens and invites (e2e)', () => {
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

  it('creates a kitchen with the creator as owner in one transaction', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const created = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Dom Testowy' },
    });
    expect(created.status).toBe(201);
    const body = created.body as {
      id: string;
      members: Array<{ role: string; userId: string }>;
    };
    expect(body.members).toHaveLength(1);
    expect(body.members[0]?.role).toBe('owner');
    expect(body.members[0]?.userId).toBe(owner.id);
  });

  it('does not allow a member to invite and hides foreign kitchens', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const stranger = await signUpUser(api.origin, WEB_ORIGIN);

    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Kuchnia Isolacja' },
    });
    const kitchen = kitchenRes.body as { id: string };

    const inviteRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/invites`,
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

    const memberInvite = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/invites`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
        body: { email: 'ktoinny@example.com' },
      },
    );
    expect(memberInvite.status).toBe(403);

    const strangerGet = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: stranger.cookies,
      },
    );
    expect(strangerGet.status).toBe(404);
    expect(strangerGet.text).not.toContain('Kuchnia Isolacja');

    const strangerInvite = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/invites`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: stranger.cookies,
        body: { email: 'x@example.com' },
      },
    );
    expect(strangerInvite.status).toBe(404);
  });

  it('rejects wrong email, expired, revoked and reused tokens', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const invited = await signUpUser(api.origin, WEB_ORIGIN);
    const wrongEmail = await signUpUser(api.origin, WEB_ORIGIN);

    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Zaproszenia' },
    });
    const kitchen = kitchenRes.body as { id: string };

    const inviteRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/invites`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { email: invited.email },
      },
    );
    const invite = inviteRes.body as { id: string; inviteUrl: string };
    const token = invite.inviteUrl.split('/').pop() ?? '';

    const wrong = await apiFetch(api.origin, `/api/invites/${token}/accept`, {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: wrongEmail.cookies,
    });
    expect(wrong.status).toBe(400);

    const expiredRows = await executeTestDb(
      'UPDATE "KitchenInvite" SET "expiresAt" = $1 WHERE "tokenHash" = $2',
      [new Date('2000-01-01T00:00:00.000Z'), hashInviteToken(token)],
    );
    expect(expiredRows).toBe(1);
    const expired = await apiFetch(api.origin, `/api/invites/${token}/accept`, {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: invited.cookies,
    });
    expect(expired.status).toBe(400);

    await queryTestDb(
      'UPDATE "KitchenInvite" SET "expiresAt" = $1, "revokedAt" = $2 WHERE "tokenHash" = $3',
      [new Date(Date.now() + 86_400_000), new Date(), hashInviteToken(token)],
    );
    const revoked = await apiFetch(api.origin, `/api/invites/${token}/accept`, {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: invited.cookies,
    });
    expect(revoked.status).toBe(409);

    const secondInviteRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/invites`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { email: invited.email },
      },
    );
    const secondToken =
      (secondInviteRes.body as { inviteUrl: string }).inviteUrl
        .split('/')
        .pop() ?? '';
    const firstAccept = await apiFetch(
      api.origin,
      `/api/invites/${secondToken}/accept`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: invited.cookies,
      },
    );
    expect(firstAccept.status).toBe(201);
    const reuse = await apiFetch(
      api.origin,
      `/api/invites/${secondToken}/accept`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: invited.cookies,
      },
    );
    expect(reuse.status).toBe(409);
    expect(hashInviteToken(secondToken)).toHaveLength(64);
  });

  it('does not create two memberships when the same token is used concurrently', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const invited = await signUpUser(api.origin, WEB_ORIGIN);

    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Wyścig tokenu' },
    });
    const kitchen = kitchenRes.body as { id: string };
    const inviteRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/invites`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { email: invited.email },
      },
    );
    const token =
      (inviteRes.body as { inviteUrl: string }).inviteUrl.split('/').pop() ??
      '';

    const [first, second] = await Promise.all([
      apiFetch(api.origin, `/api/invites/${token}/accept`, {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: invited.cookies,
      }),
      apiFetch(api.origin, `/api/invites/${token}/accept`, {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: invited.cookies,
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const memberships = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "KitchenMember" WHERE "kitchenId" = $1 AND "userId" = $2',
      [kitchen.id, invited.id],
    );
    expect(Number(memberships[0]?.count)).toBe(1);
  });

  it('allows only the owner to delete a kitchen and cascades related data', async () => {
    const owner = await signUpUser(api.origin, WEB_ORIGIN);
    const member = await signUpUser(api.origin, WEB_ORIGIN);
    const stranger = await signUpUser(api.origin, WEB_ORIGIN);

    const kitchenRes = await apiFetch(api.origin, '/api/kitchens', {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Kuchnia Do Usunięcia' },
    });
    expect(kitchenRes.status).toBe(201);
    const kitchen = kitchenRes.body as { id: string };

    const inviteRes = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}/invites`,
      {
        method: 'POST',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
        body: { email: member.email },
      },
    );
    const invite = inviteRes.body as { inviteUrl: string };
    const token = invite.inviteUrl.split('/').pop() ?? '';
    await apiFetch(api.origin, `/api/invites/${token}/accept`, {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: member.cookies,
    });

    await apiFetch(api.origin, `/api/kitchens/${kitchen.id}/products`, {
      method: 'POST',
      webOrigin: WEB_ORIGIN,
      cookies: owner.cookies,
      body: { name: 'Mleko', defaultUnit: 'milliliter' },
    });

    const memberDelete = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: member.cookies,
      },
    );
    expect(memberDelete.status).toBe(403);

    const strangerDelete = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: stranger.cookies,
      },
    );
    expect(strangerDelete.status).toBe(404);

    const ownerDelete = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}`,
      {
        method: 'DELETE',
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(ownerDelete.status).toBe(204);

    const kitchens = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "Kitchen" WHERE id = $1',
      [kitchen.id],
    );
    expect(Number(kitchens[0]?.count)).toBe(0);

    const products = await queryTestDb<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "Product" WHERE "kitchenId" = $1',
      [kitchen.id],
    );
    expect(Number(products[0]?.count)).toBe(0);

    const afterDelete = await apiFetch(
      api.origin,
      `/api/kitchens/${kitchen.id}`,
      {
        webOrigin: WEB_ORIGIN,
        cookies: owner.cookies,
      },
    );
    expect(afterDelete.status).toBe(404);
  });
});
