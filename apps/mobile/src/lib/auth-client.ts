import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import { getApiBaseUrl } from '@/lib/api-url';

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  plugins: [
    expoClient({
      scheme: 'mojakuchnia',
      storagePrefix: 'mojakuchnia',
      storage: SecureStore,
    }),
  ],
});
