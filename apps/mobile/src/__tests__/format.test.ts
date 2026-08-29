import {
  formatMoneyMinor,
  formatQuantity,
  newIdempotencyKey,
} from '@/lib/format';

describe('format helpers', () => {
  it('formats quantity and money', () => {
    expect(formatQuantity('100.000', 'gram')).toContain('g');
    expect(formatMoneyMinor(599)).toContain('5,99');
    expect(formatMoneyMinor(null)).toBe('brak ceny');
  });

  it('creates unique idempotency keys', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
