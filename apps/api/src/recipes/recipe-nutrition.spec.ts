import { Prisma } from '../generated/prisma/client';
import { ProductUnit, RecipeIngredientUnit } from '../generated/prisma/client';

import {
  computeRecipeNutrition,
  type NutritionIngredientInput,
  type ProductNutritionInput,
} from './recipe-nutrition';

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

const MILK_ID = 'product-milk';
const EGG_ID = 'product-egg';

/** Mleko: 100 ml = 64 kcal, 3.2 B, 4.7 W, 3.6 T. */
const milkNutrition: ProductNutritionInput = {
  baseQuantity: decimal('100'),
  baseUnit: ProductUnit.milliliter,
  kcal: decimal('64'),
  proteinGrams: decimal('3.2'),
  carbsGrams: decimal('4.7'),
  fatGrams: decimal('3.6'),
};

/** Jajko: 1 sztuka = 78 kcal, 6.3 B, 0.6 W, 5.3 T. */
const eggNutrition: ProductNutritionInput = {
  baseQuantity: decimal('1'),
  baseUnit: ProductUnit.piece,
  kcal: decimal('78'),
  proteinGrams: decimal('6.3'),
  carbsGrams: decimal('0.6'),
  fatGrams: decimal('5.3'),
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

describe('computeRecipeNutrition', () => {
  it('przelicza litry na mililitry i skaluje po porcjach', () => {
    const result = computeRecipeNutrition({
      baseServings: 2,
      servings: 4,
      ingredients: [
        ingredient({
          name: 'Mleko',
          quantity: decimal('0.3'),
          unit: RecipeIngredientUnit.liter,
          productId: MILK_ID,
        }),
      ],
      nutritionByProductId: new Map([[MILK_ID, milkNutrition]]),
    });

    // 0.3 l dla 2 porcji => 600 ml dla 4 porcji => 6 x wartości ze 100 ml.
    expect(result.isComplete).toBe(true);
    expect(result.countedIngredients).toBe(1);
    expect(result.recipe).toEqual({
      kcal: '384.00',
      proteinGrams: '19.20',
      carbsGrams: '28.20',
      fatGrams: '21.60',
    });
    expect(result.perServing?.kcal).toBe('96.00');
  });

  it('sumuje sztuki i mililitry z kilku składników', () => {
    const result = computeRecipeNutrition({
      baseServings: 1,
      servings: 1,
      ingredients: [
        ingredient({
          name: 'Jajka',
          quantity: decimal('3'),
          unit: RecipeIngredientUnit.piece,
          productId: EGG_ID,
        }),
        ingredient({
          name: 'Mleko',
          quantity: decimal('200'),
          unit: RecipeIngredientUnit.milliliter,
          productId: MILK_ID,
        }),
      ],
      nutritionByProductId: new Map([
        [EGG_ID, eggNutrition],
        [MILK_ID, milkNutrition],
      ]),
    });

    expect(result.recipe).toEqual({
      kcal: '362.00',
      proteinGrams: '25.30',
      carbsGrams: '11.20',
      fatGrams: '23.10',
    });
    expect(result.missingIngredientNames).toEqual([]);
  });

  it('nie zwraca zera przy braku danych — sumy są null', () => {
    const result = computeRecipeNutrition({
      baseServings: 2,
      servings: 2,
      ingredients: [
        ingredient({ name: 'Sól', unit: RecipeIngredientUnit.to_taste }),
      ],
      nutritionByProductId: new Map(),
    });

    expect(result.recipe).toBeNull();
    expect(result.perServing).toBeNull();
    expect(result.countedIngredients).toBe(0);
    expect(result.isComplete).toBe(false);
    expect(result.missingIngredientNames).toEqual(['Sól']);
  });

  it('pomija składniki w jednostkach nieprzeliczalnych i oznacza niekompletność', () => {
    const result = computeRecipeNutrition({
      baseServings: 1,
      servings: 1,
      ingredients: [
        ingredient({
          name: 'Mleko',
          quantity: decimal('100'),
          unit: RecipeIngredientUnit.milliliter,
          productId: MILK_ID,
        }),
        ingredient({
          name: 'Oliwa',
          quantity: decimal('2'),
          unit: RecipeIngredientUnit.tablespoon,
          productId: 'product-oil',
        }),
      ],
      nutritionByProductId: new Map([[MILK_ID, milkNutrition]]),
    });

    expect(result.countedIngredients).toBe(1);
    expect(result.totalIngredients).toBe(2);
    expect(result.isComplete).toBe(false);
    expect(result.missingIngredientNames).toEqual(['Oliwa']);
    expect(result.recipe?.kcal).toBe('64.00');
  });

  it('pomija składnik, gdy rodzina jednostek nie pasuje do produktu', () => {
    const result = computeRecipeNutrition({
      baseServings: 1,
      servings: 1,
      ingredients: [
        ingredient({
          name: 'Mleko',
          quantity: decimal('100'),
          unit: RecipeIngredientUnit.gram,
          productId: MILK_ID,
        }),
      ],
      nutritionByProductId: new Map([[MILK_ID, milkNutrition]]),
    });

    expect(result.countedIngredients).toBe(0);
    expect(result.recipe).toBeNull();
    expect(result.missingIngredientNames).toEqual(['Mleko']);
  });
});
