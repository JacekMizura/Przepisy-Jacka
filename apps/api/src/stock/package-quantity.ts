import { BadRequestException } from '@nestjs/common';
import {
  PackageContentUnit,
  Prisma,
  ProductUnit,
} from '../generated/prisma/client';

import { formatQuantity, parseQuantityString } from '../common/quantity';

/**
 * Przelicza liczbę opakowań × zawartość opakowania na ilość zapasu
 * w jednostce produktu (`ProductUnit`).
 *
 * Bezpieczne konwersje: piece↔piece, g↔kg, ml↔l.
 * Odrzuca masę↔objętość oraz piece↔masa/objętość.
 */
export function packageCountToStockQuantity(params: {
  packageCount: string;
  packageQuantity: Prisma.Decimal | string;
  packageUnit: PackageContentUnit;
  defaultUnit: ProductUnit;
}): { quantity: Prisma.Decimal; formatted: string } {
  const count = parseQuantityString(params.packageCount, 'packageCount');
  if (count.lte(0)) {
    throw new BadRequestException('packageCount musi być większe od zera.');
  }

  const packageQuantity =
    typeof params.packageQuantity === 'string'
      ? parseQuantityString(params.packageQuantity, 'packageQuantity')
      : params.packageQuantity;
  if (packageQuantity.lte(0)) {
    throw new BadRequestException(
      'packageQuantity musi być większe od zera, aby przeliczyć packageCount.',
    );
  }

  const contentInPackageUnit = count.mul(packageQuantity);
  const quantity = convertPackageContentToProductUnit(
    contentInPackageUnit,
    params.packageUnit,
    params.defaultUnit,
  );

  return { quantity, formatted: formatQuantity(quantity) };
}

export function convertPackageContentToProductUnit(
  content: Prisma.Decimal,
  packageUnit: PackageContentUnit,
  defaultUnit: ProductUnit,
): Prisma.Decimal {
  if (packageUnit === PackageContentUnit.piece) {
    if (defaultUnit !== ProductUnit.piece) {
      throw unsafePackageConversion(packageUnit, defaultUnit);
    }
    return content;
  }

  if (
    packageUnit === PackageContentUnit.gram ||
    packageUnit === PackageContentUnit.kilogram
  ) {
    if (defaultUnit !== ProductUnit.gram) {
      throw unsafePackageConversion(packageUnit, defaultUnit);
    }
    if (packageUnit === PackageContentUnit.kilogram) {
      return content.mul(1000);
    }
    return content;
  }

  if (
    packageUnit === PackageContentUnit.milliliter ||
    packageUnit === PackageContentUnit.liter
  ) {
    if (defaultUnit !== ProductUnit.milliliter) {
      throw unsafePackageConversion(packageUnit, defaultUnit);
    }
    if (packageUnit === PackageContentUnit.liter) {
      return content.mul(1000);
    }
    return content;
  }

  throw unsafePackageConversion(packageUnit, defaultUnit);
}

function unsafePackageConversion(
  packageUnit: PackageContentUnit,
  defaultUnit: ProductUnit,
): BadRequestException {
  return new BadRequestException(
    `Nie można bezpiecznie przeliczyć opakowania (${packageUnit}) na jednostkę zapasu (${defaultUnit}).`,
  );
}
