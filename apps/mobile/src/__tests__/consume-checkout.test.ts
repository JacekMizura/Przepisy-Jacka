import {
  convertToBaseQuantity,
  minorFromZloty,
  newIdempotencyKey,
} from '@/lib/format';
import { ApiRequestError, isConflict, messageForStatus } from '@/lib/api-result';

describe('consume / checkout helpers', () => {
  it('converts kg to grams for consume quantity', () => {
    const result = convertToBaseQuantity('1,5', 'kilogram', 'gram');
    expect(result).toEqual({ ok: true, quantity: '1500.000' });
  });

  it('rejects incompatible units', () => {
    const result = convertToBaseQuantity('2', 'liter', 'gram');
    expect(result.ok).toBe(false);
  });

  it('parses PLN to minor for checkout', () => {
    expect(minorFromZloty('12,99')).toBe(1299);
    expect(minorFromZloty('abc')).toBeNull();
  });

  it('maps 409 conflict for stale consume fingerprint', () => {
    const error = new ApiRequestError(
      409,
      'Stan zapasów się zmienił — odśwież podgląd.',
    );
    expect(isConflict(error)).toBe(true);
    expect(messageForStatus(409, 'x')).toContain('Konflikt');
  });

  it('builds checkout idempotency key with prefix', () => {
    expect(newIdempotencyKey('checkout')).toMatch(/^checkout-/);
  });
});
