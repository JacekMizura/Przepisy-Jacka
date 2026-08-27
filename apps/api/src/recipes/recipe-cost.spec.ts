import { Prisma } from '../generated/prisma/client';
import { ProductUnit, RecipeIngredientUnit } from '../generated/prisma/client';

import { computeRecipeCost, type ProductPriceInput } from './recipe-cost';
import { type NutritionIngredientInput } from './recipe-nutrition';

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

const MILK_ID = 'product-milk';
const EGG_ID = 'product-egg';

/** Ostatni zakup: 1000 ml mleka za 320 groszy. */
const milkPrice: ProductPriceInput = {
  productId: MILK_ID,
  productName: 'Mleko',
  purchasedAt: new Date('2026-08-20T10:00:00.000Z'),
  quantity: decimal('1000'),
  priceMinor: 320,
  baseUnit: ProductUnit.milliliter,
};

/** Ostatni zakup: 10 jajek za 1200 groszy. */
const eggPrice: ProductPriceInput = {
  productId: EGG_ID,
  productName: 'Jajka',
  purchasedAt: new Date('2026-08-21T10:00:00.000Z'),
  quantity: decimal('10'),
  priceMinor: 1200,
  baseUnit: ProductUnit.piece,
};

function ingredient(
  overrides: Partial<NutritionIngredientInput> & { name: string },
): NutritionIngredientInput {
  return {
    id: `ingredient-${overrides.name}`,
    quantity: decimal('1'),
    unit: RecipeIngredientUnit.piece,
    productId: null,
    ...overrides,
  };
}

describe('computeRecipeCost', () => {
  it('liczy 600 ml mleka z ceny 1000 ml za 320 groszy', () => {
    const result = computeRecipeCost({
      baseServings: 1,
      servings: 1,
      ingredients: [
        ingredient({
          name: 'Mleko',
          quantity: decimal('600'),
          unit: RecipeIngredientUnit.milliliter,
          productId: MILK_ID,
        }),
      ],
      pricesByProductId: new Map([[MILK_ID, milkPrice]]),
    });

    expect(result.recipeTotalMinor).toBe(192);
    expect(result.perServingMinor).toBe(192);
    expect(result.isComplete).toBe(true);
    expect(result.priceSources).toEqual([
      {
        productId: MILK_ID,
        productName: 'Mleko',
        purchasedAt: '2026-08-20T10:00:00.000Z',
        unitPriceMinorPerBase: '0.3200',
        baseUnit: ProductUnit.milliliter,
      },
    ]);
    expect(result.note).toBe('Szacunkowo na podstawie ostatnich zakupów');
  });

  it('liczy 4 jajka z ceny 10 sztuk za 1200 groszy', () => {
    const result = computeRecipeCost({
      baseServings: 2,
      servings: 4,
      ingredients: [
        ingredient({
          name: 'Jajka',
          quantity: decimal('2'),
          unit: RecipeIngredientUnit.piece,
          productId: EGG_ID,
        }),
      ],
      pricesByProductId: new Map([[EGG_ID, eggPrice]]),
    });

    expect(result.recipeTotalMinor).toBe(480);
    expect(result.perServingMinor).toBe(120);
  });

  it('zaokrągla dopiero na końcu, po zsumowaniu składników', () => {
    const result = computeRecipeCost({
      baseServings: 1,
      servings: 1,
      ingredients: [
        ingredient({
          name: 'Mleko',
          quantity: decimal('0.333'),
          unit: RecipeIngredientUnit.liter,
          productId: MILK_ID,
        }),
        ingredient({
          name: 'Jajka',
          quantity: decimal('1'),
          unit: RecipeIngredientUnit.piece,
          productId: EGG_ID,
        }),
      ],
      pricesByProductId: new Map([
        [MILK_ID, milkPrice],
        [EGG_ID, eggPrice],
      ]),
    });

    // 333 ml * 0.32 = 106.56 gr; 1 jajko = 120 gr; razem 226.56 => 227.
    expect(result.recipeTotalMinor).toBe(227);
    expect(result.priceSources).toHaveLength(2);
  });

  it('traktuje brak zakupu jako brak danych, nie jako zero', () => {
    const result = computeRecipeCost({
      baseServings: 1,
      servings: 1,
      ingredients: [
        ingredient({
          name: 'Mleko',
          quantity: decimal('100'),
          unit: RecipeIngredientUnit.milliliter,
          productId: MILK_ID,
        }),
      ],
      pricesByProductId: new Map(),
    });

    expect(result.recipeTotalMinor).toBeNull();
    expect(result.perServingMinor).toBeNull();
    expect(result.isComplete).toBe(false);
    expect(result.missingIngredientNames).toEqual(['Mleko']);
  });

  it('pomija jednostki nieprzeliczalne i niezgodne rodziny jednostek', () => {
    const result = computeRecipeCost({
      baseServings: 1,
      servings: 1,
      ingredients: [
        ingredient({
          name: 'Oliwa',
          quantity: decimal('2'),
          unit: RecipeIngredientUnit.tablespoon,
          productId: MILK_ID,
        }),
        ingredient({
          name: 'Mleko w gramach',
          quantity: decimal('100'),
          unit: RecipeIngredientUnit.gram,
          productId: MILK_ID,
        }),
        ingredient({
          name: 'Jajka',
          quantity: decimal('2'),
          unit: RecipeIngredientUnit.piece,
          productId: EGG_ID,
        }),
      ],
      pricesByProductId: new Map([
        [MILK_ID, milkPrice],
        [EGG_ID, eggPrice],
      ]),
    });

    expect(result.countedIngredients).toBe(1);
    expect(result.totalIngredients).toBe(3);
    expect(result.recipeTotalMinor).toBe(240);
    expect(result.missingIngredientNames).toEqual(['Oliwa', 'Mleko w gramach']);
  });
});
