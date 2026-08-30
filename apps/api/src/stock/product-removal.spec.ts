import { Prisma } from '../generated/prisma/client';
import { ProductUnit } from '../generated/prisma/client';

import {
  canUndoProductAddition,
  resolveProductRemovalMode,
  type ProductRemovalFacts,
} from './product-removal';

function baseFacts(
  overrides: Partial<ProductRemovalFacts> = {},
): ProductRemovalFacts {
  return {
    isArchived: false,
    pendingShoppingCount: 0,
    recipeIngredientCount: 0,
    purchaseLineItemCount: 0,
    stockConsumptionCount: 0,
    purchaseLinkedStockItemCount: 0,
    stockItemsWithConsumptionCount: 0,
    stockItemCount: 1,
    hasNutrition: true,
    hasPurchaseOptions: false,
    hasImageMedia: false,
    remainingStockQuantity: new Prisma.Decimal('450'),
    defaultUnit: ProductUnit.gram,
    ...overrides,
  };
}

describe('resolveProductRemovalMode', () => {
  it('returns undo for manual intake with stock and nutrition', () => {
    const preview = resolveProductRemovalMode(baseFacts());
    expect(preview.mode).toBe('undo');
    expect(preview.canUndo).toBe(true);
    expect(preview.canArchive).toBe(true);
    expect(preview.canWriteOffAndArchive).toBe(false);
    expect(preview.reason).toBeNull();
    expect(preview.willRemove).toEqual([
      'partie zapasu',
      'wartości odżywcze',
      'produkt z katalogu',
    ]);
    expect(preview.willKeep).toEqual([]);
    expect(preview.remainingStockQuantity).toBe('450.000');
    expect(preview.remainingStockUnit).toBe(ProductUnit.gram);
  });

  it('allows undo with unused purchase options', () => {
    const preview = resolveProductRemovalMode(
      baseFacts({
        hasPurchaseOptions: true,
        stockItemCount: 0,
        hasNutrition: false,
        remainingStockQuantity: new Prisma.Decimal(0),
      }),
    );
    expect(preview.mode).toBe('undo');
    expect(preview.willRemove).toContain('opcje zakupu');
    expect(preview.remainingStockQuantity).toBeNull();
  });

  it('blocks when archived', () => {
    const preview = resolveProductRemovalMode(baseFacts({ isArchived: true }));
    expect(preview.mode).toBe('blocked');
    expect(preview.canUndo).toBe(false);
    expect(preview.canArchive).toBe(false);
    expect(preview.reason).toMatch(/zarchiwizowany/i);
  });

  it('blocks when pending shopping', () => {
    const preview = resolveProductRemovalMode(
      baseFacts({ pendingShoppingCount: 1 }),
    );
    expect(preview.mode).toBe('blocked');
    expect(preview.canArchive).toBe(false);
    expect(preview.reason).toMatch(/zakupów/i);
  });

  it('archives when consumptions exist', () => {
    const preview = resolveProductRemovalMode(
      baseFacts({
        stockConsumptionCount: 1,
        stockItemsWithConsumptionCount: 1,
        remainingStockQuantity: new Prisma.Decimal('100'),
      }),
    );
    expect(preview.mode).toBe('archive');
    expect(preview.canUndo).toBe(false);
    expect(preview.canArchive).toBe(true);
    expect(preview.canWriteOffAndArchive).toBe(true);
    expect(preview.willKeep).toEqual(
      expect.arrayContaining(['historia zużyć', 'partie zapasu']),
    );
    expect(preview.reason).toMatch(/zużyć/i);
  });

  it('archives when purchase-linked batches exist', () => {
    const preview = resolveProductRemovalMode(
      baseFacts({
        purchaseLineItemCount: 1,
        purchaseLinkedStockItemCount: 1,
      }),
    );
    expect(preview.mode).toBe('archive');
    expect(preview.canUndo).toBe(false);
    expect(preview.willKeep).toContain('zakupy i paragony');
    expect(preview.reason).toMatch(/zakup/i);
  });

  it('archives when used in recipes', () => {
    const preview = resolveProductRemovalMode(
      baseFacts({ recipeIngredientCount: 2 }),
    );
    expect(preview.mode).toBe('archive');
    expect(preview.canUndo).toBe(false);
    expect(preview.willKeep).toContain('powiązania z przepisami');
    expect(preview.reason).toMatch(/przepis/i);
  });
});

describe('canUndoProductAddition', () => {
  it('is false when any blocking fact is set', () => {
    expect(canUndoProductAddition(baseFacts())).toBe(true);
    expect(
      canUndoProductAddition(baseFacts({ stockConsumptionCount: 1 })),
    ).toBe(false);
    expect(
      canUndoProductAddition(baseFacts({ purchaseLinkedStockItemCount: 1 })),
    ).toBe(false);
  });
});
