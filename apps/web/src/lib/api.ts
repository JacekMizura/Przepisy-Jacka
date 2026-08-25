import { createApiClient } from "@moja-kuchnia/api-client";

export function getApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error("Brak NEXT_PUBLIC_API_URL.");
  }
  return url;
}

export function createWebApiClient() {
  return createApiClient({
    baseUrl: getApiBaseUrl(),
  });
}
