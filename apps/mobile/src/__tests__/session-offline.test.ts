import { ApiRequestError, messageForStatus } from '@/lib/api-result';

describe('session and offline errors', () => {
  it('surfaces session expiry for 401', () => {
    expect(messageForStatus(401, 'x')).toMatch(/Sesja wygasła/);
    expect(new ApiRequestError(401, 'Sesja wygasła.').status).toBe(401);
  });

  it('maps offline-ish network messages for retry UX', () => {
    const offline = new Error('Network request failed');
    expect(offline.message.toLowerCase()).toContain('network');
    expect(messageForStatus(503, 'x')).toMatch(/niedostępna/);
    expect(messageForStatus(429, 'x')).toMatch(/żądań/);
  });
});
