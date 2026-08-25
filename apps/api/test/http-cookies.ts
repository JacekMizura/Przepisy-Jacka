export function applySetCookie(
  jar: Map<string, string>,
  setCookies: readonly string[],
): void {
  for (const header of setCookies) {
    const pair = header.split(';', 1)[0];
    if (!pair) {
      continue;
    }
    const separator = pair.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    jar.set(name, value);
  }
}

export function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export function parseJsonBody(body: string): unknown {
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}
