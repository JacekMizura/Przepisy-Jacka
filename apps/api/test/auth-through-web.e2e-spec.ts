import type { Server } from 'node:http';

import { startApiServer, type RunningApi } from './create-api-app';
import { applySetCookie, cookieHeader } from './http-cookies';
import { getFreePort, startWebOriginProxy } from './web-server';

jest.setTimeout(60_000);

describe('Auth through web origin (e2e)', () => {
  let api: RunningApi;
  let webServer: Server;
  let webOrigin: string;

  beforeAll(async () => {
    const webPort = await getFreePort();
    webOrigin = `http://127.0.0.1:${webPort}`;
    api = await startApiServer({
      PUBLIC_WEB_ORIGIN: webOrigin,
      BETTER_AUTH_URL: webOrigin,
      AUTH_TRUSTED_ORIGINS: webOrigin,
      CORS_ORIGINS: webOrigin,
    });
    webServer = await startWebOriginProxy({
      port: webPort,
      apiOrigin: api.origin,
    });
  });

  afterAll(() => {
    webServer.close();
    api.stop();
  });

  it('registers, sessions, cookies and PATCH /api/me through the web origin', async () => {
    const email = `web-auth-${Date.now()}@example.com`;
    const password = 'HasloTestowe1';
    const jar = new Map<string, string>();

    const register = await fetch(`${webOrigin}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        origin: webOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        name: 'Użytkownik Testowy',
      }),
    });
    expect(register.status).toBeLessThan(400);
    const registerCookies = register.headers.getSetCookie();
    expect(registerCookies.length).toBeGreaterThan(0);
    applySetCookie(jar, registerCookies);
    expect(cookieHeader(jar).length).toBeGreaterThan(0);

    const sessionAfterSignUp = await fetch(
      `${webOrigin}/api/auth/get-session`,
      {
        headers: {
          origin: webOrigin,
          cookie: cookieHeader(jar),
        },
      },
    );
    expect(sessionAfterSignUp.status).toBe(200);
    const signedUp = (await sessionAfterSignUp.json()) as {
      user?: { email?: string };
    };
    expect(signedUp.user?.email).toBe(email);

    const signOut = await fetch(`${webOrigin}/api/auth/sign-out`, {
      method: 'POST',
      headers: {
        origin: webOrigin,
        cookie: cookieHeader(jar),
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(signOut.status).toBeLessThan(400);
    applySetCookie(jar, signOut.headers.getSetCookie());

    const sessionAfterSignOut = await fetch(
      `${webOrigin}/api/auth/get-session`,
      {
        headers: {
          origin: webOrigin,
          cookie: cookieHeader(jar),
        },
      },
    );
    const signedOutBody = await sessionAfterSignOut.text();
    expect(signedOutBody === '' || signedOutBody === 'null').toBe(true);

    jar.clear();
    const signIn = await fetch(`${webOrigin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        origin: webOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    expect(signIn.status).toBeLessThan(400);
    const signInCookies = signIn.headers.getSetCookie();
    expect(signInCookies.length).toBeGreaterThan(0);
    expect(
      signInCookies.some((cookie) => cookie.toLowerCase().includes('httponly')),
    ).toBe(true);
    applySetCookie(jar, signInCookies);

    const me = await fetch(`${webOrigin}/api/me`, {
      headers: {
        origin: webOrigin,
        cookie: cookieHeader(jar),
      },
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { email?: string; name?: string };
    expect(meBody.email).toBe(email);

    const invalidPatch = await fetch(`${webOrigin}/api/me`, {
      method: 'PATCH',
      headers: {
        origin: webOrigin,
        cookie: cookieHeader(jar),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: '' }),
    });
    expect(invalidPatch.status).toBe(400);

    const validPatch = await fetch(`${webOrigin}/api/me`, {
      method: 'PATCH',
      headers: {
        origin: webOrigin,
        cookie: cookieHeader(jar),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Jacek Testowy' }),
    });
    expect(validPatch.status).toBe(200);
    const patched = (await validPatch.json()) as { name?: string };
    expect(patched.name).toBe('Jacek Testowy');
  });
});
