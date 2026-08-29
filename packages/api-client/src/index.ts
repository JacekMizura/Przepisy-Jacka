import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "./generated/schema";

export type { paths, components } from "./generated/schema";

export type CreateApiClientOptions = {
  baseUrl: string;
  credentials?: RequestCredentials;
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
};

type BareClient = ReturnType<typeof createClient<paths>>;

export function createApiClient(
  options: CreateApiClientOptions,
): BareClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    credentials: options.credentials ?? "same-origin",
  });

  if (options.getHeaders) {
    const getHeaders = options.getHeaders;
    const middleware: Middleware = {
      async onRequest({ request }) {
        const headers = await getHeaders();
        if (!headers) {
          return request;
        }

        const incoming = new Headers(headers);
        incoming.forEach((value, key) => {
          request.headers.set(key, value);
        });

        return request;
      },
    };
    client.use(middleware);
  }

  return client;
}

export type ApiClient = BareClient;
