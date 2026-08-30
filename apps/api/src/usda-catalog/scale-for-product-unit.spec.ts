import { Prisma, ProductUnit } from '../generated/prisma/client';

import { scaleCatalogNutritionForProductUnit } from './scale-for-product-unit';

describe('scaleCatalogNutritionForProductUnit', () => {
  const per100g = {
    kcal: new Prisma.Decimal(18),
    proteinGrams: new Prisma.Decimal(0.9),
    carbsGrams: new Prisma.Decimal(3.9),
    fatGrams: new Prisma.Decimal(0.2),
    fiberGrams: new Prisma.Decimal(1.2),
    saltGrams: new Prisma.Decimal(0.01),
  };

  it('dla gram zwraca bazę 100 g niezależnie od opakowania produktu', () => {
    const scaled = scaleCatalogNutritionForProductUnit(
      per100g,
      ProductUnit.gram,
    );
    expect(scaled.baseQuantity.toNumber()).toBe(100);
    expect(scaled.baseUnit).toBe(ProductUnit.gram);
    expect(scaled.kcal.toNumber()).toBe(18);
    expect(scaled.pieceGrams).toBeNull();
  });

  it('dla piece wymaga jawnej masy i skaluje od 100 g', () => {
    const scaled = scaleCatalogNutritionForProductUnit(
      per100g,
      ProductUnit.piece,
      '200',
    );
    expect(scaled.baseQuantity.toNumber()).toBe(1);
    expect(scaled.baseUnit).toBe(ProductUnit.piece);
    expect(scaled.kcal.toNumber()).toBeCloseTo(36, 5);
    expect(scaled.pieceGrams?.toNumber()).toBe(200);
  });
});
