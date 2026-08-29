import { BadRequestException } from '@nestjs/common';

import { resolveStockConsumptionKindAndReason } from './stock-consumption-kind';

describe('resolveStockConsumptionKindAndReason', () => {
  it('defaults to consume without reason for backward compatibility', () => {
    expect(resolveStockConsumptionKindAndReason({})).toEqual({
      kind: 'consume',
      reason: null,
    });
  });

  it('allows optional reason on consume', () => {
    expect(
      resolveStockConsumptionKindAndReason({
        kind: 'consume',
        reason: '  użyte w zupie  ',
      }),
    ).toEqual({ kind: 'consume', reason: 'użyte w zupie' });
  });

  it('requires reason for write_off', () => {
    expect(() =>
      resolveStockConsumptionKindAndReason({ kind: 'write_off' }),
    ).toThrow(BadRequestException);
    expect(() =>
      resolveStockConsumptionKindAndReason({
        kind: 'write_off',
        reason: '   ',
      }),
    ).toThrow(/wymagany/);
  });

  it('stores trimmed write_off reason', () => {
    expect(
      resolveStockConsumptionKindAndReason({
        kind: 'write_off',
        reason: '  zepsute  ',
      }),
    ).toEqual({ kind: 'write_off', reason: 'zepsute' });
  });

  it('rejects overly long reason', () => {
    expect(() =>
      resolveStockConsumptionKindAndReason({
        kind: 'write_off',
        reason: 'x'.repeat(201),
      }),
    ).toThrow(/maksymalnie/);
  });
});
