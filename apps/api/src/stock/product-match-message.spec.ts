import { ProductPurchaseMode, ProductUnit } from '../generated/prisma/client';
import type { ProductDto } from './dto/product.dto';
import { buildProductMatchMessage } from './product-match-message';

function stubProduct(id: string): ProductDto {
  return {
    id,
    kitchenId: 'kitchen',
    groupId: null,
    groupName: null,
    name: 'Mleko',
    normalizedName: 'mleko',
    defaultUnit: ProductUnit.milliliter,
    purchaseMode: ProductPurchaseMode.unconfigured,
    ean: null,
    brand: null,
    variantLabel: null,
    packageQuantity: null,
    packageUnit: null,
    imageUrl: null,
    image: null,
    nutrition: null,
    category: null,
    archivedAt: null,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('buildProductMatchMessage', () => {
  it('returns catalog message for exact EAN or name', () => {
    expect(
      buildProductMatchMessage({
        exactEan: stubProduct('a'),
        exactName: null,
        archivedMatch: null,
      }),
    ).toContain('już w katalogu');

    expect(
      buildProductMatchMessage({
        exactEan: null,
        exactName: stubProduct('b'),
        archivedMatch: stubProduct('c'),
      }),
    ).toContain('już w katalogu');
  });

  it('returns restore message for archived match only', () => {
    expect(
      buildProductMatchMessage({
        exactEan: null,
        exactName: null,
        archivedMatch: stubProduct('archived'),
      }),
    ).toContain('Przywróć');
  });

  it('returns null when nothing matched', () => {
    expect(
      buildProductMatchMessage({
        exactEan: null,
        exactName: null,
        archivedMatch: null,
      }),
    ).toBeNull();
  });
});
