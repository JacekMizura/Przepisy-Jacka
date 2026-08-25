import { createApiClient } from "@moja-kuchnia/api-client";

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

export function createWebApiClient() {
  return createApiClient({
    baseUrl: getApiBaseUrl(),
    credentials: "same-origin",
  });
}
