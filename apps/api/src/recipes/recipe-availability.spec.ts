import { Prisma } from '../generated/prisma/client';
import {
  ProductPurchaseMode,
  ProductUnit,
  RecipeIngredientUnit,
} from '../generated/prisma/client';

import {
  computeRecipeAvailability,
  scaleIngredientQuantity,
} from './recipe-availability';

describe('recipe-availability', () => {
  const baseIngredient = {
    id: 'ing-1',
    recipeId: 'recipe-1',
    name: 'Mleko',
    quantity: new Prisma.Decimal('1.000'),
    unit: RecipeIngredientUnit.liter,
    note: null,
    productId: 'prod-1',
    sortOrder: 0,
    product: {
      id: 'prod-1',
      kitchenId: 'kitchen-1',
      name: 'Mleko',
      normalizedName: 'mleko',
      defaultUnit: ProductUnit.milliliter,
      purchaseMode: ProductPurchaseMode.unconfigured,
      ean: null,
      imageUrl: null,
      category: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  it('scales ingredient quantities by servings', () => {
    const scaled = scaleIngredientQuantity(new Prisma.Decimal('2.000'), 2, 4);
    expect(scaled?.toFixed(3)).toBe('4.000');
  });

  it('converts kg/g and l/ml for availability', () => {
    const result = computeRecipeAvailability({
      recipeId: 'recipe-1',
      baseServings: 2,
      servings: 2,
      ingredients: [baseIngredient],
      stockItems: [
        {
          productId: 'prod-1',
          quantity: new Prisma.Decimal('500.000'),
          expiresAt: null,
        },
      ],
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(result.ingredients[0]?.status).toBe('partial');
    expect(result.ingredients[0]?.availableQuantity).toBe('0.500');
    expect(result.ingredients[0]?.gapQuantity).toBe('0.500');
  });

  it('marks incompatible units as unknown', () => {
    const result = computeRecipeAvailability({
      recipeId: 'recipe-1',
      baseServings: 2,
      servings: 2,
      ingredients: [
        {
          ...baseIngredient,
          quantity: new Prisma.Decimal('2.000'),
          unit: RecipeIngredientUnit.tablespoon,
        },
      ],
      stockItems: [
        {
          productId: 'prod-1',
          quantity: new Prisma.Decimal('1000.000'),
          expiresAt: null,
        },
      ],
    });

    expect(result.ingredients[0]?.status).toBe('unknown');
  });

  it('ignores expired stock batches', () => {
    const result = computeRecipeAvailability({
      recipeId: 'recipe-1',
      baseServings: 2,
      servings: 2,
      ingredients: [
        {
          ...baseIngredient,
          quantity: new Prisma.Decimal('0.500'),
          unit: RecipeIngredientUnit.liter,
        },
      ],
      stockItems: [
        {
          productId: 'prod-1',
          quantity: new Prisma.Decimal('1000.000'),
          expiresAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      ],
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(result.ingredients[0]?.status).toBe('missing');
  });
});
