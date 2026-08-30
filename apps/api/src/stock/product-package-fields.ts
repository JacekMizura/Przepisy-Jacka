import { BadRequestException } from '@nestjs/common';
import { PackageContentUnit, Prisma } from '../generated/prisma/client';

import { parseQuantityString } from '../common/quantity';

export type ParsedPackageFields = {
  brand: string | null;
  variantLabel: string | null;
  packageQuantity: Prisma.Decimal | null;
  packageUnit: PackageContentUnit | null;
};

export function normalizeOptionalText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new BadRequestException(
      `Tekst nie może być dłuższy niż ${maxLength} znaków.`,
    );
  }
  return trimmed;
}

/**
 * Waliduje i normalizuje brand / variant / package*.
 * Gdy podano tylko jedno z packageQuantity|packageUnit → 400.
 * Gdy oba — quantity musi być > 0.
 */
export function parsePackageFields(input: {
  brand?: string | null;
  variantLabel?: string | null;
  packageQuantity?: string | null;
  packageUnit?: PackageContentUnit | null;
}): ParsedPackageFields {
  const brand = normalizeOptionalText(input.brand, 120);
  const variantLabel = normalizeOptionalText(input.variantLabel, 80);

  const hasQuantity =
    input.packageQuantity !== undefined &&
    input.packageQuantity !== null &&
    String(input.packageQuantity).trim() !== '';
  const hasUnit = input.packageUnit !== undefined && input.packageUnit !== null;

  if (hasQuantity !== hasUnit) {
    throw new BadRequestException(
      'packageQuantity i packageUnit muszą być podane razem albo oba pominięte.',
    );
  }

  if (!hasQuantity || !hasUnit) {
    return {
      brand,
      variantLabel,
      packageQuantity: null,
      packageUnit: null,
    };
  }

  const packageQuantity = parseQuantityString(
    String(input.packageQuantity),
    'packageQuantity',
  );
  if (packageQuantity.lte(0)) {
    throw new BadRequestException(
      'packageQuantity musi być większe od zera, gdy podano packageUnit.',
    );
  }

  return {
    brand,
    variantLabel,
    packageQuantity,
    packageUnit: input.packageUnit!,
  };
}

/** Dla update: undefined = nie zmieniaj; null/wartość = ustaw. */
export function applyOptionalPackageFieldUpdates(
  data: Prisma.ProductUpdateInput,
  dto: {
    brand?: string | null;
    variantLabel?: string | null;
    packageQuantity?: string | null;
    packageUnit?: PackageContentUnit | null;
  },
): void {
  if (dto.brand !== undefined) {
    data.brand = normalizeOptionalText(dto.brand, 120);
  }
  if (dto.variantLabel !== undefined) {
    data.variantLabel = normalizeOptionalText(dto.variantLabel, 80);
  }

  const quantityProvided = dto.packageQuantity !== undefined;
  const unitProvided = dto.packageUnit !== undefined;
  if (!quantityProvided && !unitProvided) {
    return;
  }

  if (quantityProvided && unitProvided) {
    if (
      dto.packageQuantity === null ||
      dto.packageQuantity === '' ||
      dto.packageUnit === null
    ) {
      if (
        (dto.packageQuantity === null || dto.packageQuantity === '') !==
        (dto.packageUnit === null)
      ) {
        throw new BadRequestException(
          'packageQuantity i packageUnit muszą być czyszczone razem.',
        );
      }
      data.packageQuantity = null;
      data.packageUnit = null;
      return;
    }
    const parsed = parsePackageFields({
      packageQuantity: dto.packageQuantity,
      packageUnit: dto.packageUnit,
    });
    data.packageQuantity = parsed.packageQuantity;
    data.packageUnit = parsed.packageUnit;
    return;
  }

  throw new BadRequestException(
    'packageQuantity i packageUnit muszą być aktualizowane razem.',
  );
}
