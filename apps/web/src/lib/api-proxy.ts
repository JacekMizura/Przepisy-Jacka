/** Nagłówki hop-by-hop oraz Host — nie przekazywane do upstream. */
const REQUEST_SKIP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  // Body i Content-Length ustawia fetch na podstawie przekazanego bufora.
  "content-length",
]);

/** Nagłówki hop-by-hop odpowiedzi — Content-Length zachowujemy dla niezmienionego body. */
const RESPONSE_SKIP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

export function getApiOrigin(): string {
  const origin = process.env.API_ORIGIN;
  if (!origin) {
    throw new Error("Brak serwerowej zmiennej API_ORIGIN.");
  }
  return origin.replace(/\/$/, "");
}

export async function proxyToApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Destynacja wyłącznie z serwerowego API_ORIGIN + ścieżka/query z żądania.
  const target = `${getApiOrigin()}${url.pathname}${url.search}`;
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!REQUEST_SKIP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  const host = request.headers.get("host");
  if (host) {
    headers.set("x-forwarded-host", host);
  }
  headers.set("x-forwarded-proto", url.protocol.replace(/:$/, ""));

  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });
  } catch {
    return new Response(JSON.stringify({ message: "API niedostępne." }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "set-cookie") {
      return;
    }
    if (!RESPONSE_SKIP.has(lower)) {
      responseHeaders.append(key, value);
    }
  });
  // getSetCookie zachowuje osobne wartości — nie łączymy ich w jeden nagłówek.
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
