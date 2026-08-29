import {
  convertToBaseQuantity,
  formatMoneyMinor,
  formatQuantity,
  minorFromZloty,
} from '@/lib/format';

describe('stock/shopping format helpers', () => {
  it('formats money and quantity for PL locale', () => {
    expect(formatMoneyMinor(1250)).toMatch(/12[,.]50/);
    expect(formatQuantity('1.5', 'gram')).toContain('g');
  });

  it('converts input units to base quantity', () => {
    expect(convertToBaseQuantity('1.5', 'kilogram', 'gram')).toEqual({
      ok: true,
      quantity: '1500.000',
    });
    expect(convertToBaseQuantity('-1', 'gram', 'gram').ok).toBe(false);
  });

  it('parses zloty to minor units for checkout', () => {
    expect(minorFromZloty('12,50')).toBe(1250);
    expect(minorFromZloty('abc')).toBeNull();
  });
});
