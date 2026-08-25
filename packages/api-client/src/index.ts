import createClient from "openapi-fetch";

import type { paths } from "./generated/schema";

export type { paths };

export type CreateApiClientOptions = {
  baseUrl: string;
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
};

export function createApiClient(options: CreateApiClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
  });

  if (options.getHeaders) {
    client.use({
      async onRequest({ request }) {
        const headers = await options.getHeaders?.();
        if (!headers) {
          return request;
        }

        const incoming = new Headers(headers);
        incoming.forEach((value, key) => {
          request.headers.set(key, value);
        });

        return request;
      },
    });
  }

  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
