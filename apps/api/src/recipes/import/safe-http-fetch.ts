import { lookup } from 'node:dns/promises';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { URL } from 'node:url';

import {
  assertPublicHttpsUrl,
  isBlockedHostname,
  isBlockedIpAddress,
} from './url-safety';

export type SafeFetchResult = {
  finalUrl: string;
  statusCode: number;
  contentType: string | null;
  body: string;
};

export type SafeFetchOptions = {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  userAgent: string;
};

export type DnsLookupFn = (
  hostname: string,
) => Promise<Array<{ address: string; family: 4 | 6 }>>;

const DEFAULT_LOOKUP: DnsLookupFn = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({
    address: record.address,
    family: record.family === 6 ? 6 : 4,
  }));
};

/**
 * Pobiera HTTPS z walidacją SSRF: DNS → filtr IP → połączenie do zweryfikowanego IP,
 * Host z oryginalnej nazwy, ręczne przekierowania (max N).
 */
export async function safeFetchHttps(
  rawUrl: string,
  options: SafeFetchOptions,
  dnsLookup: DnsLookupFn = DEFAULT_LOOKUP,
): Promise<SafeFetchResult> {
  let current = assertPublicHttpsUrl(rawUrl);
  let redirects = 0;

  while (true) {
    const result = await fetchOnce(current, options, dnsLookup);
    const redirect =
      result.statusCode >= 300 &&
      result.statusCode < 400 &&
      result.locationHeader
        ? result.locationHeader
        : null;

    if (!redirect) {
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(
          `Strona źródłowa zwróciła status HTTP ${result.statusCode}.`,
        );
      }
      return {
        finalUrl: current.toString(),
        statusCode: result.statusCode,
        contentType: result.contentType,
        body: result.body,
      };
    }

    redirects += 1;
    if (redirects > options.maxRedirects) {
      throw new Error('Zbyt wiele przekierowań przy pobieraniu strony.');
    }

    const next = new URL(redirect, current);
    current = assertPublicHttpsUrl(next.toString());
  }
}

async function fetchOnce(
  url: URL,
  options: SafeFetchOptions,
  dnsLookup: DnsLookupFn,
): Promise<{
  statusCode: number;
  locationHeader: string | null;
  contentType: string | null;
  body: string;
}> {
  if (isBlockedHostname(url.hostname)) {
    throw new Error('Adres wskazuje na zablokowany host.');
  }

  const records = await dnsLookup(url.hostname);
  if (records.length === 0) {
    throw new Error('Nie udało się rozwiązać adresu DNS strony.');
  }

  const allowed = records.filter(
    (record) => !isBlockedIpAddress(record.address),
  );
  if (allowed.length === 0) {
    throw new Error('Adres DNS wskazuje wyłącznie na zablokowane IP.');
  }

  const target = allowed.find((record) => record.family === 4) ?? allowed[0]!;

  if (isBlockedIpAddress(target.address)) {
    throw new Error('Adres IP został zablokowany przed połączeniem.');
  }

  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const succeed = (value: {
      statusCode: number;
      locationHeader: string | null;
      contentType: string | null;
      body: string;
    }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => {
      req.destroy();
      fail(new Error('Przekroczono limit czasu pobierania strony.'));
    }, options.timeoutMs);

    const requestOptions: RequestOptions = {
      protocol: 'https:',
      hostname: target.address,
      servername: url.hostname,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        Host: url.host,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pl,en;q=0.8',
        'User-Agent': options.userAgent,
      },
      timeout: options.timeoutMs,
    };

    const req = httpsRequest(requestOptions, (res) => {
      const statusCode = res.statusCode ?? 0;
      const locationHeader = res.headers.location
        ? String(res.headers.location)
        : null;
      const contentType = res.headers['content-type']
        ? String(res.headers['content-type'])
        : null;

      res.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > options.maxBytes) {
          res.destroy();
          fail(new Error('Odpowiedź strony przekracza dozwolony rozmiar.'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        clearTimeout(timer);
        const body = Buffer.concat(chunks).toString('utf8');
        if (Buffer.byteLength(body, 'utf8') > options.maxBytes) {
          fail(new Error('Odpowiedź strony przekracza dozwolony rozmiar.'));
          return;
        }
        succeed({ statusCode, locationHeader, contentType, body });
      });
      res.on('error', (error) => {
        clearTimeout(timer);
        fail(error instanceof Error ? error : new Error(String(error)));
      });
    });

    req.on('error', (error) => {
      clearTimeout(timer);
      fail(error instanceof Error ? error : new Error(String(error)));
    });

    req.on('socket', (socket) => {
      socket.on('connect', () => {
        const peer = socket.remoteAddress;
        if (peer && isBlockedIpAddress(peer)) {
          req.destroy();
          fail(new Error('Połączenie trafiło na zablokowany adres IP.'));
        }
      });
    });

    req.end();
  });
}

export function createPinnedLookup(
  mapping: Record<string, Array<{ address: string; family: 4 | 6 }>>,
): DnsLookupFn {
  return (hostname) => {
    const key = hostname.toLowerCase();
    const found = mapping[key];
    if (!found) {
      return Promise.reject(new Error(`Brak mapowania DNS dla ${hostname}`));
    }
    return Promise.resolve(found);
  };
}
