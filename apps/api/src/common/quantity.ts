import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

const QUANTITY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

export function parseQuantityString(
  value: string,
  fieldName: string,
): Prisma.Decimal {
  const trimmed = value.trim();
  if (!QUANTITY_PATTERN.test(trimmed)) {
    throw new BadRequestException(
      `${fieldName} musi być nieujemną liczbą dziesiętną z maksymalnie 3 miejscami, np. "500.000".`,
    );
  }
  return new Prisma.Decimal(trimmed);
}

export function formatQuantity(value: Prisma.Decimal): string {
  return value.toFixed(3);
}

export function assertStockQuantities(
  initialQuantity: Prisma.Decimal,
  quantity: Prisma.Decimal,
): void {
  if (initialQuantity.lte(0)) {
    throw new BadRequestException('initialQuantity musi być większe od 0.');
  }
  if (quantity.lt(0)) {
    throw new BadRequestException('quantity nie może być ujemne.');
  }
  if (quantity.gt(initialQuantity)) {
    throw new BadRequestException(
      'quantity nie może być większe niż initialQuantity.',
    );
  }
}
