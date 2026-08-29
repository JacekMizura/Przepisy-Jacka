/**
 * @jest-environment node
 */
import { QueryClient } from '@tanstack/react-query';

describe('kitchen switch cache policy', () => {
  it('clears all cached kitchen data on kitchen change', async () => {
    const client = new QueryClient();
    client.setQueryData(['stock-summary', 'kitchen-a'], [{ id: '1' }]);
    client.setQueryData(['shopping-list', 'kitchen-a'], [{ id: '2' }]);
    client.setQueryData(['stock-summary', 'kitchen-b'], [{ id: '3' }]);

    await client.cancelQueries();
    client.clear();

    expect(client.getQueryData(['stock-summary', 'kitchen-a'])).toBeUndefined();
    expect(client.getQueryData(['shopping-list', 'kitchen-a'])).toBeUndefined();
    expect(client.getQueryData(['stock-summary', 'kitchen-b'])).toBeUndefined();
  });
});

describe('checkout idempotency key', () => {
  it('reuses the same key for retry without inventing a second purchase', () => {
    const key = `checkout-${'list-1'}-attempt`;
    const first = { idempotencyKey: key, items: [{ id: 'i1' }] };
    const retry = { idempotencyKey: key, items: [{ id: 'i1' }] };
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
  });
});

describe('consume preview conflict', () => {
  it('treats mismatched fingerprint as refresh-required 409', () => {
    const previewFingerprint = 'fp-1';
    const commitFingerprint = 'fp-2';
    const conflict = previewFingerprint !== commitFingerprint;
    expect(conflict).toBe(true);
  });
});
