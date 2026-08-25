import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { gzipSync } from "node:zlib";

import { proxyToApi } from "./api-proxy.ts";

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("api-proxy compressed POST response", () => {
  let upstream: Server;
  let upstreamOrigin = "";
  let requestCount = 0;
  let lastAcceptEncoding: string | null = null;

  before(async () => {
    upstream = createServer((req, res) => {
      void (async () => {
        requestCount += 1;
        lastAcceptEncoding = req.headers["accept-encoding"] ?? null;
        await readBody(req);

        const payload = Buffer.from(
          JSON.stringify({ id: "kitchen-1", name: "Domowa" }),
          "utf8",
        );
        const compressed = gzipSync(payload);

        res.statusCode = 201;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("content-encoding", "gzip");
        res.setHeader("content-length", String(compressed.length));
        res.setHeader("set-cookie", [
          "session=abc; Path=/; HttpOnly; SameSite=Lax",
          "csrf=xyz; Path=/; SameSite=Lax",
        ]);
        res.end(compressed);
      })();
    });

    await new Promise<void>((resolve, reject) => {
      upstream.listen(0, "127.0.0.1", () => resolve());
      upstream.on("error", reject);
    });
    const address = upstream.address();
    if (!address || typeof address === "string") {
      throw new Error("Brak portu upstream.");
    }
    upstreamOrigin = `http://127.0.0.1:${address.port}`;
    process.env.API_ORIGIN = upstreamOrigin;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("returns readable JSON 201 once and preserves separate Set-Cookie", async () => {
    requestCount = 0;
    lastAcceptEncoding = "sentinel";

    const incoming = new Request("http://127.0.0.1:3100/api/kitchens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-encoding": "gzip, deflate, br",
        cookie: "browser=1",
      },
      body: JSON.stringify({ name: "Domowa" }),
    });

    const response = await proxyToApi(incoming);

    assert.equal(requestCount, 1, "upstream musi dostać dokładnie jedno żądanie");
    assert.equal(
      lastAcceptEncoding,
      "identity",
      "do upstream trafia identity, nie Accept-Encoding przeglądarki",
    );
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("content-encoding"), null);
    assert.equal(response.headers.get("content-length"), null);

    const body = await response.json();
    assert.deepEqual(body, { id: "kitchen-1", name: "Domowa" });

    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.match(cookies[0] ?? "", /^session=abc/);
    assert.match(cookies[1] ?? "", /^csrf=xyz/);
  });
});
