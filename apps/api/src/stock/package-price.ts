import { BadRequestException } from '@nestjs/common';

/**
 * Dodatnia liczba całkowita opakowań (bez Float).
 */
export function parsePositivePackageCount(raw: string): number {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new BadRequestException(
      'packageCount musi być dodatnią liczbą całkowitą.',
    );
  }
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BadRequestException(
      'packageCount musi być dodatnią liczbą całkowitą.',
    );
  }
  return value;
}

/**
 * Łączna cena partii w groszach: cena opakowania × liczba opakowań (integer).
 */
export function totalPriceMinorFromPackages(
  packagePriceMinor: number,
  packageCount: number,
): number {
  if (
    !Number.isInteger(packagePriceMinor) ||
    packagePriceMinor < 0 ||
    !Number.isSafeInteger(packagePriceMinor)
  ) {
    throw new BadRequestException(
      'Cena za opakowanie musi być nieujemną liczbą całkowitą (grosze).',
    );
  }
  if (
    !Number.isInteger(packageCount) ||
    packageCount < 1 ||
    !Number.isSafeInteger(packageCount)
  ) {
    throw new BadRequestException(
      'packageCount musi być dodatnią liczbą całkowitą.',
    );
  }
  const total = packagePriceMinor * packageCount;
  if (!Number.isSafeInteger(total)) {
    throw new BadRequestException('Łączna cena partii jest zbyt duża.');
  }
  return total;
}
