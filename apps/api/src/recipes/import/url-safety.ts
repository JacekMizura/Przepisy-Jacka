import { isIP } from 'node:net';

/** Blokuje hosty/IP prywatne, lokalne, link-local i metadane (SSRF). */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) {
    return true;
  }
  if (
    host === 'localhost' ||
    host === 'localhost.localdomain' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal' ||
    host === 'metadata'
  ) {
    return true;
  }
  if (isIP(host)) {
    return isBlockedIpAddress(host);
  }
  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) {
    return true;
  }

  if (normalized.includes(':')) {
    return isBlockedIpv6(normalized);
  }
  return isBlockedIpv4(normalized);
}

function normalizeIp(ip: string): string | null {
  const trimmed = ip.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  // IPv4-mapped IPv6: ::ffff:127.0.0.1
  const mapped = trimmed.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) {
    return mapped[1];
  }
  return trimmed;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  if (ip === '::' || ip === '::1') {
    return true;
  }
  // Unique local fc00::/7, link-local fe80::/10
  if (
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('fe8') ||
    ip.startsWith('fe9') ||
    ip.startsWith('fea') ||
    ip.startsWith('feb')
  ) {
    return true;
  }
  // IPv4-mapped already normalized; remaining mapped forms
  if (ip.startsWith('::ffff:')) {
    const v4 = ip.slice('::ffff:'.length);
    if (isIP(v4) === 4) {
      return isBlockedIpv4(v4);
    }
  }
  return false;
}

export function assertPublicHttpsUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error('Niepoprawny adres URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Dozwolone są wyłącznie publiczne adresy HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Adres nie może zawierać danych logowania.');
  }
  if (parsed.port && parsed.port !== '443') {
    throw new Error('Dozwolony jest wyłącznie standardowy port HTTPS (443).');
  }
  if (!parsed.hostname || isBlockedHostname(parsed.hostname)) {
    throw new Error('Adres wskazuje na zablokowany host.');
  }
  return parsed;
}
