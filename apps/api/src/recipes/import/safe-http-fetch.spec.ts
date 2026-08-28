import {
  createPinnedLookup,
  safeFetchHttps,
  type DnsLookupFn,
} from './safe-http-fetch';

const options = {
  timeoutMs: 1_000,
  maxBytes: 8_000,
  maxRedirects: 3,
  userAgent: 'MojaKuchnia-Test/0.1',
};

describe('safeFetchHttps', () => {
  it('rejects when DNS resolves only to private addresses', async () => {
    const dns = createPinnedLookup({
      'evil.example': [{ address: '127.0.0.1', family: 4 }],
    });

    await expect(
      safeFetchHttps('https://evil.example/recipe', options, dns),
    ).rejects.toThrow(/zablokowane IP/i);
  });

  it('rejects when DNS resolves to cloud metadata range', async () => {
    const dns = createPinnedLookup({
      'meta.example': [{ address: '169.254.169.254', family: 4 }],
    });

    await expect(
      safeFetchHttps('https://meta.example/', options, dns),
    ).rejects.toThrow(/zablokowane IP/i);
  });

  it('rejects IPv6 unique-local DNS answers', async () => {
    const dns = createPinnedLookup({
      'ula.example': [{ address: 'fd12:3456:789a::1', family: 6 }],
    });

    await expect(
      safeFetchHttps('https://ula.example/', options, dns),
    ).rejects.toThrow(/zablokowane IP/i);
  });

  it('rejects empty DNS answers', async () => {
    const dns: DnsLookupFn = () => Promise.resolve([]);
    await expect(
      safeFetchHttps('https://missing.example/', options, dns),
    ).rejects.toThrow(/DNS/i);
  });
});
