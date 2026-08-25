import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

import { applySetCookie, cookieHeader, parseJsonBody } from './http-cookies';
import { applyTestEnv } from './test-env';
import { getFreePort, waitForHttp } from './web-server';

export type TestUser = {
  email: string;
  password: string;
  name: string;
  cookies: Map<string, string>;
  id: string;
};

export type RunningApi = {
  origin: string;
  port: number;
  stop: () => void;
};

function stopChild(child: ChildProcess): void {
  if (!child.pid) {
    return;
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }
  child.kill('SIGTERM');
}

export async function startApiServer(
  extraEnv?: Record<string, string>,
): Promise<RunningApi> {
  const port = extraEnv?.API_PORT
    ? Number(extraEnv.API_PORT)
    : await getFreePort();
  applyTestEnv({
    API_PORT: String(port),
    ...extraEnv,
  });

  const child = spawn(
    process.execPath,
    [resolve(__dirname, '../dist/main.js')],
    {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[api] ${chunk.toString()}`);
  });

  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${origin}/api/health`, 30_000);
  } catch (error) {
    stopChild(child);
    throw error;
  }

  return {
    origin,
    port,
    stop: () => stopChild(child),
  };
}

export async function apiFetch(
  origin: string,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    cookies?: Map<string, string>;
    body?: unknown;
    webOrigin: string;
  },
): Promise<{
  status: number;
  body: unknown;
  text: string;
  setCookies: string[];
}> {
  const headers = new Headers();
  headers.set('origin', options.webOrigin);
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  if (options.cookies && options.cookies.size > 0) {
    headers.set('cookie', cookieHeader(options.cookies));
  }

  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    redirect: 'manual',
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: parseJsonBody(text),
    setCookies: response.headers.getSetCookie(),
  };
}

export async function signUpUser(
  apiOrigin: string,
  webOrigin: string,
  overrides?: Partial<Pick<TestUser, 'email' | 'password' | 'name'>>,
): Promise<TestUser> {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const email = overrides?.email ?? `user-${suffix}@example.com`;
  const password = overrides?.password ?? 'HasloTestowe1';
  const name = overrides?.name ?? 'Użytkownik Testowy';
  const cookies = new Map<string, string>();

  const response = await apiFetch(apiOrigin, '/api/auth/sign-up/email', {
    method: 'POST',
    webOrigin,
    body: { email, password, name },
  });
  if (response.status >= 400) {
    throw new Error(
      `Rejestracja nie powiodła się (${response.status}): ${response.text}`,
    );
  }
  applySetCookie(cookies, response.setCookies);

  const body = response.body;
  const id =
    body &&
    typeof body === 'object' &&
    'user' in body &&
    body.user &&
    typeof body.user === 'object' &&
    'id' in body.user &&
    typeof body.user.id === 'string'
      ? body.user.id
      : '';

  if (!id) {
    throw new Error(`Brak user.id po rejestracji: ${response.text}`);
  }

  return { email, password, name, cookies, id };
}
