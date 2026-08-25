const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
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
  const target = `${getApiOrigin()}${url.pathname}${url.search}`;
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
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
  const upstream = await fetch(target, {
    method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      return;
    }
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      responseHeaders.append(key, value);
    }
  });
  const cookies = upstream.headers.getSetCookie();
  for (const cookie of cookies) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
