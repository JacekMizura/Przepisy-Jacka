import { Prisma } from '../generated/prisma/client';
import { ProductUnit } from '../generated/prisma/client';

import {
  buildPurchaseProposal,
  proposePackageCount,
} from './purchase-proposal';

describe('purchase-proposal', () => {
  it('proposes one 1l carton for a 100 ml gap', () => {
    const gap = new Prisma.Decimal('100');
    const carton = new Prisma.Decimal('1000');
    expect(proposePackageCount(gap, carton)).toBe(1);

    const proposal = buildPurchaseProposal({
      gapInProductBase: gap,
      productUnit: ProductUnit.milliliter,
      options: [
        {
          id: 'opt-1l',
          name: 'Karton 1 l',
          contentQuantity: carton,
          contentUnit: ProductUnit.milliliter,
          isDefault: true,
          isActive: true,
        },
      ],
    });

    expect(proposal.mode).toBe('packages');
    expect(proposal.packageCount).toBe(1);
    expect(proposal.purchaseOptionName).toBe('Karton 1 l');
    expect(proposal.totalPurchaseQuantity).toBe('1000.000');
  });

  it('proposes two packages when one is not enough', () => {
    const gap = new Prisma.Decimal('1200');
    const carton = new Prisma.Decimal('1000');
    expect(proposePackageCount(gap, carton)).toBe(2);

    const proposal = buildPurchaseProposal({
      gapInProductBase: gap,
      productUnit: ProductUnit.milliliter,
      options: [
        {
          id: 'opt-1l',
          name: 'Karton 1 l',
          contentQuantity: carton,
          contentUnit: ProductUnit.milliliter,
          isDefault: true,
          isActive: true,
        },
      ],
    });

    expect(proposal.packageCount).toBe(2);
    expect(proposal.totalPurchaseQuantity).toBe('2000.000');
  });

  it('allows switching purchase option', () => {
    const proposal = buildPurchaseProposal({
      gapInProductBase: new Prisma.Decimal('100'),
      productUnit: ProductUnit.milliliter,
      preferredOptionId: 'opt-500',
      options: [
        {
          id: 'opt-1l',
          name: 'Karton 1 l',
          contentQuantity: new Prisma.Decimal('1000'),
          contentUnit: ProductUnit.milliliter,
          isDefault: true,
          isActive: true,
        },
        {
          id: 'opt-500',
          name: 'Butelka 500 ml',
          contentQuantity: new Prisma.Decimal('500'),
          contentUnit: ProductUnit.milliliter,
          isDefault: false,
          isActive: true,
        },
      ],
    });

    expect(proposal.purchaseOptionId).toBe('opt-500');
    expect(proposal.packageCount).toBe(1);
    expect(proposal.totalPurchaseQuantity).toBe('500.000');
  });

  it('uses exact quantity when product has no options', () => {
    const proposal = buildPurchaseProposal({
      gapInProductBase: new Prisma.Decimal('300'),
      productUnit: ProductUnit.gram,
      options: [],
    });

    expect(proposal.mode).toBe('exact');
    expect(proposal.purchaseOptionId).toBeNull();
    expect(proposal.packageCount).toBeNull();
    expect(proposal.totalPurchaseQuantity).toBe('300.000');
    expect(proposal.totalPurchaseUnit).toBe('gram');
  });
});
