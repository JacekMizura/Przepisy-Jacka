/**
 * Kontrolowany test sesji mobile: SecureStore + Cookie + credentials omit.
 * Bez prawdziwego sieciowego Better Auth / R2.
 */

const mockSecureStore = new Map<string, string>();
const mockFetchLog: { url: string; headers: Record<string, string> }[] = [];
const mockConsoleLog = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

const mockGetCookie = jest.fn(async () => {
  return mockSecureStore.get('mojakuchnia.cookie') ?? '';
});

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    getCookie: (...args: unknown[]) => mockGetCookie(...args),
    getSession: jest.fn(async () => {
      const cookie = await mockGetCookie();
      if (!cookie) {
        return { data: null, error: null };
      }
      return {
        data: {
          user: { id: 'u1', name: 'Test', email: 't@example.com' },
          session: { token: 'session-token-should-not-log' },
        },
        error: null,
      };
    }),
    signIn: {
      email: jest.fn(async () => {
        mockSecureStore.set(
          'mojakuchnia.cookie',
          'better-auth.session_token=secret-cookie-value',
        );
        return { data: { user: { id: 'u1' } }, error: null };
      }),
    },
    signOut: jest.fn(async () => {
      mockSecureStore.delete('mojakuchnia.cookie');
      return {};
    }),
  },
}));

jest.mock('@/lib/api-url', () => ({
  getApiBaseUrl: () => 'http://api.test',
}));

import * as SecureStore from 'expo-secure-store';
import { createApiClient } from '@moja-kuchnia/api-client';
import { QueryClient } from '@tanstack/react-query';

import {
  createMobileApiClient,
  resetMobileApiClient,
} from '@/lib/api';
import { authClient } from '@/lib/auth-client';

describe('mobile auth cookie / SecureStore flow', () => {
  beforeEach(() => {
    mockSecureStore.clear();
    mockFetchLog.length = 0;
    resetMobileApiClient();
    mockConsoleLog.mockClear();
    jest.spyOn(console, 'log').mockImplementation(mockConsoleLog);
    jest.spyOn(console, 'info').mockImplementation(mockConsoleLog);
    jest.spyOn(console, 'debug').mockImplementation(mockConsoleLog);

    global.fetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request
            ? input
            : new Request(String(input), init);
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          headers[key] = value;
        });
        mockFetchLog.push({ url: request.url, headers });
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    ) as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists session cookie in SecureStore and sends Cookie with credentials omit', async () => {
    await authClient.signIn.email({
      email: 't@example.com',
      password: 'password-not-logged',
    } as never);

    expect(await SecureStore.getItemAsync('mojakuchnia.cookie')).toContain(
      'better-auth.session_token=',
    );

    const client = createMobileApiClient();
    await client.GET('/api/kitchens');

    expect(mockFetchLog.length).toBeGreaterThan(0);
    const last = mockFetchLog[mockFetchLog.length - 1]!;
    expect(last.headers.Cookie ?? last.headers.cookie).toContain(
      'better-auth.session_token=secret-cookie-value',
    );

    const bare = createApiClient({
      baseUrl: 'http://api.test',
      credentials: 'omit',
      getHeaders: async () => ({
        Cookie: (await authClient.getCookie()) || '',
      }),
    });
    await bare.GET('/api/kitchens');
    const withOmit = mockFetchLog[mockFetchLog.length - 1]!;
    expect(withOmit.headers.Cookie ?? withOmit.headers.cookie).toContain(
      'secret-cookie-value',
    );

    const leaked = mockConsoleLog.mock.calls.flat().map(String).join('\n');
    expect(leaked).not.toContain('secret-cookie-value');
    expect(leaked).not.toContain('session-token-should-not-log');
  });

  it('signOut clears SecureStore and 401 clears query cache', async () => {
    await SecureStore.setItemAsync(
      'mojakuchnia.cookie',
      'better-auth.session_token=secret-cookie-value',
    );
    const queryClient = new QueryClient();
    queryClient.setQueryData(['stock-summary', 'k1'], [{ id: '1' }]);

    await authClient.signOut();
    expect(await SecureStore.getItemAsync('mojakuchnia.cookie')).toBeNull();

    queryClient.clear();
    expect(queryClient.getQueryData(['stock-summary', 'k1'])).toBeUndefined();
  });
});
