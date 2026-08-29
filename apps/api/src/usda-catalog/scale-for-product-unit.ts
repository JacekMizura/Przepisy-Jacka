import { BadRequestException } from '@nestjs/common';
import { Prisma, ProductUnit } from '../generated/prisma/client';

import { scaleNutritionPerPiece } from './map-usda-nutrients';

export type CatalogNutritionPer100g = {
  kcal: Prisma.Decimal;
  proteinGrams: Prisma.Decimal;
  carbsGrams: Prisma.Decimal;
  fatGrams: Prisma.Decimal;
  fiberGrams: Prisma.Decimal | null;
  saltGrams: Prisma.Decimal | null;
};

export type ScaledProductNutrition = CatalogNutritionPer100g & {
  baseQuantity: Prisma.Decimal;
  baseUnit: ProductUnit;
  pieceGrams: Prisma.Decimal | null;
};

/**
 * Przelicza wartości katalogu (100 g części jadalnej) na jednostkę magazynową produktu.
 * Jednostki produktu: piece | gram | milliliter.
 * g: baza 100 g. kg w składnikach przepisów przelicza istniejąca warstwa recipe-nutrition.
 * piece: tylko z jawną masą części jadalnej 1 szt. ml: błąd (bez zgadywania g↔ml).
 */
export function scaleCatalogNutritionForProductUnit(
  per100g: CatalogNutritionPer100g,
  productUnit: ProductUnit,
  pieceGramsRaw?: string | null,
): ScaledProductNutrition {
  if (productUnit === 'milliliter') {
    throw new BadRequestException(
      'Katalog USDA podaje wartości na 100 g części jadalnej. Nie przeliczamy automatycznie na mililitry — ustaw jednostkę produktu na g lub szt. z jawną masą, albo wpisz wartości ręcznie.',
    );
  }

  if (productUnit === 'gram') {
    return {
      ...per100g,
      baseQuantity: new Prisma.Decimal(100),
      baseUnit: ProductUnit.gram,
      pieceGrams: null,
    };
  }

  if (productUnit === 'piece') {
    const raw = pieceGramsRaw?.trim() ?? '';
    if (!raw) {
      throw new BadRequestException(
        'Dla jednostki „szt.” podaj jawną masę części jadalnej jednej sztuki w gramach (pieceGrams). Nie zgadujemy masy jabłka ani jajka.',
      );
    }
    let pieceGrams: Prisma.Decimal;
    try {
      pieceGrams = new Prisma.Decimal(raw.replace(',', '.'));
    } catch {
      throw new BadRequestException('pieceGrams musi być liczbą.');
    }
    if (!pieceGrams.isFinite() || pieceGrams.lte(0)) {
      throw new BadRequestException('pieceGrams musi być większe od zera.');
    }
    const scaled = scaleNutritionPerPiece(per100g, pieceGrams);
    return {
      ...scaled,
      baseQuantity: new Prisma.Decimal(1),
      baseUnit: ProductUnit.piece,
      pieceGrams,
    };
  }

  throw new BadRequestException(
    `Nieobsługiwana jednostka produktu: ${String(productUnit)}.`,
  );
}

export function formatDecimal3(value: Prisma.Decimal): string {
  return value.toFixed(3);
}
