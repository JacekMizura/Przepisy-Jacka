import { BadRequestException } from '@nestjs/common';
import {
  PackageContentUnit,
  ProductPurchaseMode,
} from '../generated/prisma/client';
import { Prisma } from '../generated/prisma/client';

import {
  assertPackageCountAllowedForProduct,
  resolveNewProductPurchase,
} from './purchase-mode';
import type { ParsedPackageFields } from './product-package-fields';

describe('resolveNewProductPurchase', () => {
  const emptyPkg: ParsedPackageFields = {
    brand: null,
    variantLabel: null,
    packageQuantity: null,
    packageUnit: null,
  };

  const mozzarellaPkg: ParsedPackageFields = {
    brand: 'Galbani',
    variantLabel: 'kulka',
    packageQuantity: new Prisma.Decimal('125'),
    packageUnit: PackageContentUnit.gram,
  };

  it('packaged 2×125 g path requires package fields', () => {
    const resolved = resolveNewProductPurchase({
      requestedMode: ProductPurchaseMode.packaged,
      packageFields: mozzarellaPkg,
    });
    expect(resolved.purchaseMode).toBe(ProductPurchaseMode.packaged);
    expect(resolved.packageQuantity?.toString()).toBe('125');
    expect(resolved.packageUnit).toBe(PackageContentUnit.gram);
  });

  it('exact (luzem) clears package size', () => {
    const resolved = resolveNewProductPurchase({
      requestedMode: ProductPurchaseMode.exact,
      packageFields: emptyPkg,
    });
    expect(resolved.purchaseMode).toBe(ProductPurchaseMode.exact);
    expect(resolved.packageQuantity).toBeNull();
    expect(resolved.packageUnit).toBeNull();
  });

  it('rejects exact with package fields', () => {
    expect(() =>
      resolveNewProductPurchase({
        requestedMode: ProductPurchaseMode.exact,
        packageFields: mozzarellaPkg,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects packaged without package fields', () => {
    expect(() =>
      resolveNewProductPurchase({
        requestedMode: ProductPurchaseMode.packaged,
        packageFields: emptyPkg,
      }),
    ).toThrow(BadRequestException);
  });

  it('infers packaged when package fields present and mode omitted', () => {
    const resolved = resolveNewProductPurchase({
      packageFields: mozzarellaPkg,
    });
    expect(resolved.purchaseMode).toBe(ProductPurchaseMode.packaged);
  });

  it('infers exact when no package fields and mode omitted', () => {
    const resolved = resolveNewProductPurchase({
      packageFields: emptyPkg,
    });
    expect(resolved.purchaseMode).toBe(ProductPurchaseMode.exact);
  });
});

describe('assertPackageCountAllowedForProduct', () => {
  it('rejects packageCount for exact (luzem) products', () => {
    expect(() =>
      assertPackageCountAllowedForProduct({
        purchaseMode: ProductPurchaseMode.exact,
        packageQuantity: null,
        packageUnit: null,
      }),
    ).toThrow(/luzem/i);
  });

  it('allows packageCount when packaged with package size', () => {
    expect(() =>
      assertPackageCountAllowedForProduct({
        purchaseMode: ProductPurchaseMode.packaged,
        packageQuantity: new Prisma.Decimal('125'),
        packageUnit: PackageContentUnit.gram,
      }),
    ).not.toThrow();
  });
});
