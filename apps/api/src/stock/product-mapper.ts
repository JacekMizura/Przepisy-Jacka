import {
  type MediaAsset,
  type Product,
  type ProductNutrition,
  type ProductPurchaseOption,
} from '../generated/prisma/client';

import { formatQuantity } from '../common/quantity';
import { MediaImageDto } from '../media/dto/media.dto';
import { ProductDto } from './dto/product.dto';
import { ProductNutritionDto } from './dto/product-nutrition.dto';
import { PurchaseOptionDto } from './dto/purchase-option.dto';

export type ProductWithRelations = Product & {
  purchaseOptions?: ProductPurchaseOption[];
  imageMedia?: MediaAsset | null;
  nutrition?: ProductNutrition | null;
  group?: { id: string; name: string } | null;
};

export function toProductDto(
  product: ProductWithRelations,
  image: MediaImageDto | null,
): ProductDto {
  return {
    id: product.id,
    kitchenId: product.kitchenId,
    groupId: product.groupId,
    groupName: product.group?.name ?? null,
    name: product.name,
    normalizedName: product.normalizedName,
    defaultUnit: product.defaultUnit,
    purchaseMode: product.purchaseMode,
    ean: product.ean,
    brand: product.brand,
    variantLabel: product.variantLabel,
    packageQuantity:
      product.packageQuantity !== null
        ? formatQuantity(product.packageQuantity)
        : null,
    packageUnit: product.packageUnit,
    imageUrl: product.imageUrl,
    image,
    nutrition: product.nutrition
      ? toProductNutritionDto(product.nutrition)
      : null,
    category: product.category,
    archivedAt: product.archivedAt?.toISOString() ?? null,
    isArchived: product.archivedAt !== null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    purchaseOptions: product.purchaseOptions?.map(toPurchaseOptionDto) ?? [],
  };
}

export function toProductNutritionDto(
  nutrition: ProductNutrition,
): ProductNutritionDto {
  return {
    productId: nutrition.productId,
    baseQuantity: formatQuantity(nutrition.baseQuantity),
    baseUnit: nutrition.baseUnit,
    kcal: formatQuantity(nutrition.kcal),
    proteinGrams: formatQuantity(nutrition.proteinGrams),
    carbsGrams: formatQuantity(nutrition.carbsGrams),
    fatGrams: formatQuantity(nutrition.fatGrams),
    fiberGrams:
      nutrition.fiberGrams !== null
        ? formatQuantity(nutrition.fiberGrams)
        : null,
    saltGrams:
      nutrition.saltGrams !== null ? formatQuantity(nutrition.saltGrams) : null,
    source: nutrition.source,
    sourceFetchedAt: nutrition.sourceFetchedAt?.toISOString() ?? null,
    sourceLabel: nutrition.sourceLabel,
    sourceBrand: nutrition.sourceBrand,
    sourceGenericFoodId: nutrition.sourceGenericFoodId,
    sourceFdcId: nutrition.sourceFdcId,
    sourcePieceGrams:
      nutrition.sourcePieceGrams !== null
        ? formatQuantity(nutrition.sourcePieceGrams)
        : null,
    updatedAt: nutrition.updatedAt.toISOString(),
  };
}

function toPurchaseOptionDto(option: ProductPurchaseOption): PurchaseOptionDto {
  return {
    id: option.id,
    productId: option.productId,
    name: option.name,
    contentQuantity: formatQuantity(option.contentQuantity),
    contentUnit: option.contentUnit,
    isDefault: option.isDefault,
    isActive: option.isActive,
    createdAt: option.createdAt.toISOString(),
    updatedAt: option.updatedAt.toISOString(),
  };
}
