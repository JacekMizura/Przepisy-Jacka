import { createApiClient, type ApiClient } from '@moja-kuchnia/api-client';

import { getApiBaseUrl } from '@/lib/api-url';
import { authClient } from '@/lib/auth-client';

export { getApiBaseUrl };
export {
  ApiRequestError,
  apiStatus,
  isConflict,
  isUnauthorized,
  messageForStatus,
  readApiError,
  readConflictCode,
  requireApiData,
} from '@/lib/api-result';

let cachedClient: ApiClient | null = null;

/**
 * Klient domenowy: Cookie z Better Auth (SecureStore), credentials: omit.
 */
export function createMobileApiClient(): ApiClient {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = createApiClient({
    baseUrl: getApiBaseUrl(),
    credentials: 'omit',
    getHeaders: async (): Promise<Record<string, string>> => {
      const cookies = await authClient.getCookie();
      if (!cookies) {
        return {};
      }
      return { Cookie: cookies };
    },
  });

  return cachedClient;
}

export function resetMobileApiClient(): void {
  cachedClient = null;
}
