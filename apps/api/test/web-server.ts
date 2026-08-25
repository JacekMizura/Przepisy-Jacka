import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { proxyToApi } from '../../web/src/lib/api-proxy';

export async function waitForHttp(
  url: string,
  timeoutMs = 60_000,
): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status > 0) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(
    `Serwer nie odpowiedział na ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Nie udało się przydzielić portu.'));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
    server.on('error', reject);
  });
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(Buffer.from(new Uint8Array(chunk)));
    }
  }
  return Buffer.concat(chunks);
}

export async function startWebOriginProxy(options: {
  port: number;
  apiOrigin: string;
}): Promise<Server> {
  process.env.API_ORIGIN = options.apiOrigin;
  const server = createServer(
    (request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        try {
          const host = request.headers.host ?? `127.0.0.1:${options.port}`;
          const url = `http://${host}${request.url ?? '/'}`;
          const method = request.method ?? 'GET';
          const headers = new Headers();
          for (const [key, value] of Object.entries(request.headers)) {
            if (typeof value === 'string') {
              headers.set(key, value);
            } else if (Array.isArray(value)) {
              headers.set(key, value.join(', '));
            }
          }
          const hasBody = method !== 'GET' && method !== 'HEAD';
          const incoming = new Request(url, {
            method,
            headers,
            body: hasBody ? new Uint8Array(await readBody(request)) : undefined,
          });
          const upstream = await proxyToApi(incoming);
          response.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'set-cookie') {
              return;
            }
            response.setHeader(key, value);
          });
          const cookies = upstream.headers.getSetCookie();
          if (cookies.length > 0) {
            response.setHeader('set-cookie', cookies);
          }
          const buffer = Buffer.from(await upstream.arrayBuffer());
          response.end(buffer);
        } catch (error) {
          response.statusCode = 502;
          response.end(error instanceof Error ? error.message : 'Proxy error');
        }
      })();
    },
  );

  await new Promise<void>((resolveListen, reject) => {
    server.listen(options.port, '127.0.0.1', () => resolveListen());
    server.on('error', reject);
  });
  return server;
}
