import {
  assertPublicHttpsUrl,
  isBlockedHostname,
  isBlockedIpAddress,
} from './url-safety';

describe('url-safety', () => {
  it('accepts public https urls without credentials', () => {
    const url = assertPublicHttpsUrl('https://example.com/przepis');
    expect(url.hostname).toBe('example.com');
  });

  it('rejects http, credentials, custom ports and localhost', () => {
    expect(() => assertPublicHttpsUrl('http://example.com')).toThrow(/HTTPS/);
    expect(() =>
      assertPublicHttpsUrl('https://user:pass@example.com/x'),
    ).toThrow(/logowania/);
    expect(() => assertPublicHttpsUrl('https://example.com:8443/x')).toThrow(
      /port/,
    );
    expect(() => assertPublicHttpsUrl('https://localhost/x')).toThrow(
      /zablokowany/,
    );
  });

  it('blocks private and metadata IPs including IPv6 and mapped forms', () => {
    expect(isBlockedIpAddress('127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('10.0.0.5')).toBe(true);
    expect(isBlockedIpAddress('192.168.1.1')).toBe(true);
    expect(isBlockedIpAddress('169.254.169.254')).toBe(true);
    expect(isBlockedIpAddress('::1')).toBe(true);
    expect(isBlockedIpAddress('fc00::1')).toBe(true);
    expect(isBlockedIpAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('8.8.8.8')).toBe(false);
    expect(isBlockedHostname('metadata.google.internal')).toBe(true);
  });
});
