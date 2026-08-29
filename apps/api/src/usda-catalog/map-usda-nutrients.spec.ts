import { Prisma, ProductUnit } from '../generated/prisma/client';

import { mapUsdaNutrients, scaleNutritionPerPiece } from './map-usda-nutrients';
import { scaleCatalogNutritionForProductUnit } from './scale-for-product-unit';

describe('mapUsdaNutrients', () => {
  it('preferuje energię Atwater specific (2048) nad 1008', () => {
    const mapped = mapUsdaNutrients([
      { nutrientId: 1008, amount: 99, unitName: 'kcal' },
      { nutrientId: 2048, amount: 88, unitName: 'kcal' },
      { nutrientId: 1003, amount: 1, unitName: 'g' },
      { nutrientId: 1004, amount: 1, unitName: 'g' },
      { nutrientId: 1005, amount: 10, unitName: 'g' },
      { nutrientId: 1079, amount: 2, unitName: 'g' },
      { nutrientId: 1093, amount: 400, unitName: 'mg' },
    ]);
    expect(mapped.energyField).toBe('2048_atwater_specific');
    expect(Number(mapped.kcal)).toBe(88);
  });

  it('przelicza kJ tylko gdy brak kcal', () => {
    const mapped = mapUsdaNutrients([
      { nutrientId: 1009, amount: 418.4, unitName: 'kJ' },
      { nutrientId: 1003, amount: 1, unitName: 'g' },
      { nutrientId: 1004, amount: 1, unitName: 'g' },
      { nutrientId: 1005, amount: 5, unitName: 'g' },
      { nutrientId: 1079, amount: 1, unitName: 'g' },
    ]);
    expect(mapped.energyField).toBe('1009_energy_kj_converted');
    expect(Number(mapped.kcal?.toString())).toBeCloseTo(100, 1);
  });

  it('nie sumuje różnych metod energii', () => {
    const mapped = mapUsdaNutrients([
      { nutrientId: 2047, amount: 50, unitName: 'kcal' },
      { nutrientId: 1008, amount: 60, unitName: 'kcal' },
      { nutrientId: 1003, amount: 1, unitName: 'g' },
      { nutrientId: 1004, amount: 1, unitName: 'g' },
      { nutrientId: 1005, amount: 5, unitName: 'g' },
      { nutrientId: 1079, amount: 1, unitName: 'g' },
    ]);
    expect(Number(mapped.kcal)).toBe(50);
    expect(mapped.energyField).toBe('2047_atwater_general');
  });

  it('węglowodany = carb − fiber jako przybliżone; brak fiber ≠ 0', () => {
    const withFiber = mapUsdaNutrients([
      { nutrientId: 1008, amount: 100, unitName: 'kcal' },
      { nutrientId: 1003, amount: 1, unitName: 'g' },
      { nutrientId: 1004, amount: 1, unitName: 'g' },
      { nutrientId: 1005, amount: 12, unitName: 'g' },
      { nutrientId: 1079, amount: 3, unitName: 'g' },
    ]);
    expect(Number(withFiber.carbsGrams)).toBe(9);
    expect(withFiber.carbsApproximate).toBe(true);
    expect(withFiber.carbsMethod).toBe('available_approx_carb_minus_fiber');

    const noFiber = mapUsdaNutrients([
      { nutrientId: 1008, amount: 100, unitName: 'kcal' },
      { nutrientId: 1003, amount: 1, unitName: 'g' },
      { nutrientId: 1004, amount: 1, unitName: 'g' },
      { nutrientId: 1005, amount: 12, unitName: 'g' },
    ]);
    expect(noFiber.fiberGrams).toBeNull();
    expect(Number(noFiber.carbsGrams)).toBe(12);
    expect(noFiber.carbsMethod).toBe('carb_by_difference_includes_fiber');
  });

  it('odrzuca ujemne węglowodany po odjęciu błonnika', () => {
    const mapped = mapUsdaNutrients([
      { nutrientId: 1008, amount: 100, unitName: 'kcal' },
      { nutrientId: 1003, amount: 1, unitName: 'g' },
      { nutrientId: 1004, amount: 1, unitName: 'g' },
      { nutrientId: 1005, amount: 2, unitName: 'g' },
      { nutrientId: 1079, amount: 5, unitName: 'g' },
    ]);
    expect(mapped.carbsGrams).toBeNull();
    expect(mapped.incomplete).toBe(true);
  });

  it('sól = sód_mg × 2.5 / 1000; brak sodu → sól null (nie zero)', () => {
    const withNa = mapUsdaNutrients([
      { nutrientId: 1008, amount: 100, unitName: 'kcal' },
      { nutrientId: 1003, amount: 1, unitName: 'g' },
      { nutrientId: 1004, amount: 1, unitName: 'g' },
      { nutrientId: 1005, amount: 5, unitName: 'g' },
      { nutrientId: 1079, amount: 1, unitName: 'g' },
      { nutrientId: 1093, amount: 400, unitName: 'mg' },
    ]);
    expect(Number(withNa.saltGrams)).toBe(1);

    const noNa = mapUsdaNutrients([
      { nutrientId: 1008, amount: 100, unitName: 'kcal' },
      { nutrientId: 1003, amount: 1, unitName: 'g' },
      { nutrientId: 1004, amount: 1, unitName: 'g' },
      { nutrientId: 1005, amount: 5, unitName: 'g' },
      { nutrientId: 1079, amount: 1, unitName: 'g' },
    ]);
    expect(noNa.saltGrams).toBeNull();
    expect(noNa.sodiumMg).toBeNull();
  });

  it('rozróżnia brak danych od prawdziwego zera', () => {
    const zero = mapUsdaNutrients([
      { nutrientId: 1008, amount: 0, unitName: 'kcal' },
      { nutrientId: 1003, amount: 0, unitName: 'g' },
      { nutrientId: 1004, amount: 0, unitName: 'g' },
      { nutrientId: 1005, amount: 0, unitName: 'g' },
      { nutrientId: 1079, amount: 0, unitName: 'g' },
      { nutrientId: 1093, amount: 0, unitName: 'mg' },
    ]);
    expect(Number(zero.kcal)).toBe(0);
    expect(Number(zero.proteinGrams)).toBe(0);
    expect(Number(zero.saltGrams)).toBe(0);
    expect(zero.incomplete).toBe(false);

    const missing = mapUsdaNutrients([]);
    expect(missing.kcal).toBeNull();
    expect(missing.incomplete).toBe(true);
  });
});

describe('scaleNutritionPerPiece / scaleCatalogNutritionForProductUnit', () => {
  const per100g = {
    kcal: new Prisma.Decimal(100),
    proteinGrams: new Prisma.Decimal(10),
    carbsGrams: new Prisma.Decimal(20),
    fatGrams: new Prisma.Decimal(5),
    fiberGrams: new Prisma.Decimal(2),
    saltGrams: new Prisma.Decimal(1),
  };

  it('skaluje sztukę z jawną masą', () => {
    const piece = scaleNutritionPerPiece(per100g, new Prisma.Decimal(50));
    expect(piece.kcal.toString()).toBe('50');
    expect(piece.proteinGrams.toString()).toBe('5');
  });

  it('g: baza 100 g', () => {
    const g = scaleCatalogNutritionForProductUnit(per100g, ProductUnit.gram);
    expect(g.baseQuantity.toString()).toBe('100');
    expect(g.baseUnit).toBe(ProductUnit.gram);
    expect(g.kcal.toString()).toBe('100');
  });

  it('blokuje ml bez zgadywania g↔ml', () => {
    expect(() =>
      scaleCatalogNutritionForProductUnit(per100g, ProductUnit.milliliter),
    ).toThrow(/mililitry/);
  });

  it('wymaga pieceGrams dla szt.', () => {
    expect(() =>
      scaleCatalogNutritionForProductUnit(per100g, ProductUnit.piece),
    ).toThrow(/pieceGrams/);
  });
});
