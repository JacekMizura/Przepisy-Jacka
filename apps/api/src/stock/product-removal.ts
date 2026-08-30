import { Prisma } from '../generated/prisma/client';
import type { ProductUnit } from '../generated/prisma/client';

import { formatQuantity } from '../common/quantity';
import type { ProductRemovalPreviewDto } from './dto/product-removal.dto';

export type ProductRemovalMode = 'undo' | 'archive' | 'blocked';

export type ProductRemovalFacts = {
  isArchived: boolean;
  pendingShoppingCount: number;
  recipeIngredientCount: number;
  purchaseLineItemCount: number;
  stockConsumptionCount: number;
  /** Partie powiązane z pozycją zakupu. */
  purchaseLinkedStockItemCount: number;
  /** Partie z co najmniej jedną linią zużycia. */
  stockItemsWithConsumptionCount: number;
  stockItemCount: number;
  hasNutrition: boolean;
  hasPurchaseOptions: boolean;
  hasImageMedia: boolean;
  remainingStockQuantity: Prisma.Decimal;
  defaultUnit: ProductUnit;
};

const LABEL_STOCK_BATCHES = 'partie zapasu';
const LABEL_NUTRITION = 'wartości odżywcze';
const LABEL_PURCHASE_OPTIONS = 'opcje zakupu';
const LABEL_PRODUCT_IMAGE = 'zdjęcie produktu';
const LABEL_PRODUCT = 'produkt z katalogu';
const LABEL_PURCHASES = 'zakupy i paragony';
const LABEL_CONSUMPTIONS = 'historia zużyć';
const LABEL_RECIPES = 'powiązania z przepisami';

export function canUndoProductAddition(facts: ProductRemovalFacts): boolean {
  return (
    !facts.isArchived &&
    facts.pendingShoppingCount === 0 &&
    facts.recipeIngredientCount === 0 &&
    facts.purchaseLineItemCount === 0 &&
    facts.stockConsumptionCount === 0 &&
    facts.purchaseLinkedStockItemCount === 0 &&
    facts.stockItemsWithConsumptionCount === 0
  );
}

export function resolveProductRemovalMode(
  facts: ProductRemovalFacts,
): ProductRemovalPreviewDto {
  const remainingPositive = facts.remainingStockQuantity.gt(0);
  const remainingStockQuantity = remainingPositive
    ? formatQuantity(facts.remainingStockQuantity)
    : null;
  const remainingStockUnit = remainingPositive ? facts.defaultUnit : null;

  const canArchiveBase = !facts.isArchived && facts.pendingShoppingCount === 0;

  if (facts.isArchived) {
    return {
      mode: 'blocked',
      reason: 'Produkt jest już zarchiwizowany.',
      canUndo: false,
      canArchive: false,
      canWriteOffAndArchive: false,
      willRemove: [],
      willKeep: buildWillKeep(facts),
      remainingStockQuantity,
      remainingStockUnit,
    };
  }

  if (facts.pendingShoppingCount > 0) {
    return {
      mode: 'blocked',
      reason:
        'Produkt ma oczekującą pozycję na liście zakupów. Usuń lub rozlicz ją przed cofnięciem dodania albo archiwizacją.',
      canUndo: false,
      canArchive: false,
      canWriteOffAndArchive: false,
      willRemove: [],
      willKeep: buildWillKeep(facts),
      remainingStockQuantity,
      remainingStockUnit,
    };
  }

  if (canUndoProductAddition(facts)) {
    return {
      mode: 'undo',
      reason: null,
      canUndo: true,
      canArchive: canArchiveBase,
      canWriteOffAndArchive: false,
      willRemove: buildWillRemove(facts),
      willKeep: [],
      remainingStockQuantity,
      remainingStockUnit,
    };
  }

  return {
    mode: 'archive',
    reason: buildArchiveReason(facts),
    canUndo: false,
    canArchive: canArchiveBase,
    canWriteOffAndArchive: canArchiveBase && remainingPositive,
    willRemove: [],
    willKeep: buildWillKeep(facts),
    remainingStockQuantity,
    remainingStockUnit,
  };
}

function buildWillRemove(facts: ProductRemovalFacts): string[] {
  const labels: string[] = [];
  if (facts.stockItemCount > 0) {
    labels.push(LABEL_STOCK_BATCHES);
  }
  if (facts.hasNutrition) {
    labels.push(LABEL_NUTRITION);
  }
  if (facts.hasPurchaseOptions) {
    labels.push(LABEL_PURCHASE_OPTIONS);
  }
  if (facts.hasImageMedia) {
    labels.push(LABEL_PRODUCT_IMAGE);
  }
  labels.push(LABEL_PRODUCT);
  return labels;
}

function buildWillKeep(facts: ProductRemovalFacts): string[] {
  const labels: string[] = [];
  if (facts.purchaseLineItemCount > 0) {
    labels.push(LABEL_PURCHASES);
  }
  if (facts.stockConsumptionCount > 0) {
    labels.push(LABEL_CONSUMPTIONS);
  }
  if (facts.recipeIngredientCount > 0) {
    labels.push(LABEL_RECIPES);
  }
  if (facts.stockItemCount > 0) {
    labels.push(LABEL_STOCK_BATCHES);
  }
  return labels;
}

function buildArchiveReason(facts: ProductRemovalFacts): string {
  if (facts.recipeIngredientCount > 0) {
    return 'Produkt jest używany w przepisach — pełne cofnięcie dodania nie jest możliwe. Możesz go zarchiwizować; historia zostanie zachowana.';
  }
  if (
    facts.purchaseLineItemCount > 0 ||
    facts.purchaseLinkedStockItemCount > 0
  ) {
    return 'Produkt ma historię zakupów — pełne cofnięcie dodania nie jest możliwe. Możesz go zarchiwizować; zakupy i paragony zostaną zachowane.';
  }
  if (
    facts.stockConsumptionCount > 0 ||
    facts.stockItemsWithConsumptionCount > 0
  ) {
    return 'Produkt ma historię zużyć — pełne cofnięcie dodania nie jest możliwe. Możesz go zarchiwizować; historia zostanie zachowana.';
  }
  return 'Pełne cofnięcie dodania nie jest możliwe. Możesz zarchiwizować produkt; powiązana historia zostanie zachowana.';
}
