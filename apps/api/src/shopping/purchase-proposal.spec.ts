import { Prisma } from '../generated/prisma/client';
import { ProductPurchaseMode, ProductUnit } from '../generated/prisma/client';

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
      purchaseMode: ProductPurchaseMode.packaged,
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
      purchaseMode: ProductPurchaseMode.packaged,
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
      purchaseMode: ProductPurchaseMode.packaged,
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

  it('returns unconfigured when purchaseMode is unconfigured', () => {
    const proposal = buildPurchaseProposal({
      gapInProductBase: new Prisma.Decimal('300'),
      productUnit: ProductUnit.gram,
      purchaseMode: ProductPurchaseMode.unconfigured,
      options: [],
    });

    expect(proposal.mode).toBe('unconfigured');
    expect(proposal.purchaseOptionId).toBeNull();
    expect(proposal.packageCount).toBeNull();
    expect(proposal.totalPurchaseQuantity).toBe('300.000');
    expect(proposal.totalPurchaseUnit).toBe('gram');
    expect(proposal.alternatives).toEqual([]);
  });

  it('uses exact mode even when options exist', () => {
    const proposal = buildPurchaseProposal({
      gapInProductBase: new Prisma.Decimal('100'),
      productUnit: ProductUnit.milliliter,
      purchaseMode: ProductPurchaseMode.exact,
      exactQuantity: new Prisma.Decimal('100'),
      options: [
        {
          id: 'opt-1l',
          name: 'Karton 1 l',
          contentQuantity: new Prisma.Decimal('1000'),
          contentUnit: ProductUnit.milliliter,
          isDefault: true,
          isActive: true,
        },
      ],
    });

    expect(proposal.mode).toBe('exact');
    expect(proposal.purchaseOptionId).toBeNull();
    expect(proposal.packageCount).toBeNull();
    expect(proposal.totalPurchaseQuantity).toBe('100.000');
  });
});
