import { ProductUnit } from '../generated/prisma/client';

import { mapOpenFoodFactsProduct } from './map-off-product';

describe('mapOpenFoodFactsProduct', () => {
  const fetchedAt = new Date('2026-08-27T12:00:00.000Z');

  it('maps a complete 100g product without inventing zeros', () => {
    const result = mapOpenFoodFactsProduct(
      '3017624010701',
      {
        status: 1,
        product: {
          product_name: 'Nutella',
          brands: 'Ferrero',
          nutrition_data_per: '100g',
          nutriments: {
            'energy-kcal_100g': 539,
            proteins_100g: 6.3,
            carbohydrates_100g: 57.5,
            fat_100g: 30.9,
            salt_100g: 0.1075,
            sugars_100g: 56.3,
          },
        },
      },
      fetchedAt,
    );

    expect(result.status).toBe('found');
    expect(result.productName).toBe('Nutella');
    expect(result.brand).toBe('Ferrero');
    expect(result.nutrition).toEqual({
      baseQuantity: '100.000',
      baseUnit: ProductUnit.gram,
      kcal: '539.000',
      proteinGrams: '6.300',
      carbsGrams: '57.500',
      fatGrams: '30.900',
      fiberGrams: null,
      saltGrams: '0.108',
      sugarsGrams: '56.300',
      saturatedFatGrams: null,
    });
    expect(result.attribution).toBe('Open Food Facts');
  });

  it('maps 100ml base without converting to grams', () => {
    const result = mapOpenFoodFactsProduct(
      '5900000000001',
      {
        status: 1,
        product: {
          product_name: 'Mleko',
          brands: 'Łaciate',
          nutrition_data_per: '100ml',
          nutriments: {
            'energy-kcal_100g': 64,
            proteins_100g: 3.2,
            carbohydrates_100g: 4.7,
            fat_100g: 3.6,
            fiber_100g: 0,
          },
        },
      },
      fetchedAt,
    );

    expect(result.status).toBe('found');
    expect(result.nutrition?.baseUnit).toBe(ProductUnit.milliliter);
    expect(result.nutrition?.fiberGrams).toBe('0.000');
  });

  it('returns not_found when status is not 1', () => {
    const result = mapOpenFoodFactsProduct(
      '00000000',
      { status: 0 },
      fetchedAt,
    );
    expect(result.status).toBe('not_found');
    expect(result.nutrition).toBeNull();
  });

  it('marks incomplete when required macros are missing (no fake zeros)', () => {
    const result = mapOpenFoodFactsProduct(
      '5900000000002',
      {
        status: 1,
        product: {
          product_name: 'Sok',
          nutrition_data_per: '100ml',
          nutriments: {
            'energy-kcal_100g': 45,
            carbohydrates_100g: 10,
            // brak białka i tłuszczu
          },
        },
      },
      fetchedAt,
    );

    expect(result.status).toBe('incomplete');
    expect(result.nutrition).toBeNull();
    expect(result.missingFields).toEqual(
      expect.arrayContaining(['proteinGrams', 'fatGrams']),
    );
  });

  it('rejects serving-only data instead of guessing piece conversion', () => {
    const result = mapOpenFoodFactsProduct(
      '5900000000003',
      {
        status: 1,
        product: {
          product_name: 'Jajko',
          nutrition_data_per: 'serving',
          nutriments: {
            'energy-kcal': 70,
            proteins: 6,
            carbohydrates: 0.5,
            fat: 5,
          },
        },
      },
      fetchedAt,
    );

    expect(result.status).toBe('incomplete');
    expect(result.message).toMatch(/porcję/i);
    expect(result.nutrition).toBeNull();
  });
});
