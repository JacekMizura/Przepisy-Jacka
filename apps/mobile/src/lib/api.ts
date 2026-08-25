import { createApiClient } from "@moja-kuchnia/api-client";

export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error("Brak EXPO_PUBLIC_API_URL.");
  }
  return url;
}

export function createMobileApiClient() {
  return createApiClient({
    baseUrl: getApiBaseUrl(),
  });
}
