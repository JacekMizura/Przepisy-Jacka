import { BadRequestException } from '@nestjs/common';
import { PackageContentUnit, ProductUnit } from '../generated/prisma/client';

import { packageCountToStockQuantity } from './package-quantity';

describe('packageCountToStockQuantity', () => {
  it('converts piece packages to piece stock', () => {
    const result = packageCountToStockQuantity({
      packageCount: '2',
      packageQuantity: '6.000',
      packageUnit: PackageContentUnit.piece,
      defaultUnit: ProductUnit.piece,
    });
    expect(result.formatted).toBe('12.000');
  });

  it('converts gram packages to gram stock', () => {
    const result = packageCountToStockQuantity({
      packageCount: '3',
      packageQuantity: '125.000',
      packageUnit: PackageContentUnit.gram,
      defaultUnit: ProductUnit.gram,
    });
    expect(result.formatted).toBe('375.000');
  });

  it('converts kilogram packages to gram stock', () => {
    const result = packageCountToStockQuantity({
      packageCount: '2',
      packageQuantity: '1.500',
      packageUnit: PackageContentUnit.kilogram,
      defaultUnit: ProductUnit.gram,
    });
    expect(result.formatted).toBe('3000.000');
  });

  it('converts milliliter packages to milliliter stock', () => {
    const result = packageCountToStockQuantity({
      packageCount: '4',
      packageQuantity: '250.000',
      packageUnit: PackageContentUnit.milliliter,
      defaultUnit: ProductUnit.milliliter,
    });
    expect(result.formatted).toBe('1000.000');
  });

  it('converts liter packages to milliliter stock', () => {
    const result = packageCountToStockQuantity({
      packageCount: '1',
      packageQuantity: '1.000',
      packageUnit: PackageContentUnit.liter,
      defaultUnit: ProductUnit.milliliter,
    });
    expect(result.formatted).toBe('1000.000');
  });

  it('rejects mass to volume', () => {
    expect(() =>
      packageCountToStockQuantity({
        packageCount: '1',
        packageQuantity: '500.000',
        packageUnit: PackageContentUnit.gram,
        defaultUnit: ProductUnit.milliliter,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects volume to mass', () => {
    expect(() =>
      packageCountToStockQuantity({
        packageCount: '1',
        packageQuantity: '1.000',
        packageUnit: PackageContentUnit.liter,
        defaultUnit: ProductUnit.gram,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects piece to mass', () => {
    expect(() =>
      packageCountToStockQuantity({
        packageCount: '1',
        packageQuantity: '1.000',
        packageUnit: PackageContentUnit.piece,
        defaultUnit: ProductUnit.gram,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects non-positive packageCount', () => {
    expect(() =>
      packageCountToStockQuantity({
        packageCount: '0',
        packageQuantity: '125.000',
        packageUnit: PackageContentUnit.gram,
        defaultUnit: ProductUnit.gram,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects fractional packageCount', () => {
    expect(() =>
      packageCountToStockQuantity({
        packageCount: '1.5',
        packageQuantity: '125.000',
        packageUnit: PackageContentUnit.gram,
        defaultUnit: ProductUnit.gram,
      }),
    ).toThrow(BadRequestException);
  });

  it('2 × 125 g = 250 g', () => {
    const result = packageCountToStockQuantity({
      packageCount: '2',
      packageQuantity: '125.000',
      packageUnit: PackageContentUnit.gram,
      defaultUnit: ProductUnit.gram,
    });
    expect(result.formatted).toBe('250.000');
  });
});
