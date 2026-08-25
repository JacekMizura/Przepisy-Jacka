import {
  parseQuantityString,
  formatQuantity,
  assertStockQuantities,
} from './quantity';

describe('quantity helpers', () => {
  it('parses and formats decimal strings with 3 places', () => {
    const parsed = parseQuantityString('500.5', 'quantity');
    expect(formatQuantity(parsed)).toBe('500.500');
  });

  it('rejects more than 3 decimal places', () => {
    expect(() => parseQuantityString('500.1234', 'quantity')).toThrow(
      /maksymalnie 3 miejscami/,
    );
  });

  it('rejects negative quantities', () => {
    expect(() => parseQuantityString('-1', 'quantity')).toThrow();
  });

  it('rejects remaining quantity above initial', () => {
    const initial = parseQuantityString('500.000', 'initialQuantity');
    const remaining = parseQuantityString('500.001', 'quantity');
    expect(() => assertStockQuantities(initial, remaining)).toThrow(
      /nie może być większe/,
    );
  });
});
