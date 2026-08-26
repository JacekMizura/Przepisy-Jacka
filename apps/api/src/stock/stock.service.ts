import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  StorageLocation,
  type Product,
  type ProductPurchaseOption,
  type StockItem,
} from '../generated/prisma/client';

import { normalizeProductName } from '../common/normalize';
import {
  assertStockQuantities,
  formatQuantity,
  parseQuantityString,
} from '../common/quantity';
import { PrismaService } from '../prisma/prisma.service';
import { requireKitchenMember } from '../kitchens/kitchen-access';
import { CreateProductDto, ProductDto } from './dto/product.dto';
import {
  CreatePurchaseOptionDto,
  PurchaseOptionDto,
  UpdatePurchaseOptionDto,
} from './dto/purchase-option.dto';
import {
  CreateStockItemDto,
  StockItemDto,
  UpdateStockItemDto,
} from './dto/stock-item.dto';

function normalizeOptionalEan(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalImageUrl(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalCategory(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(userId: string, kitchenId: string): Promise<ProductDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const products = await this.prisma.product.findMany({
      where: { kitchenId },
      include: {
        purchaseOptions: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return products.map(toProductDto);
  }

  async createProduct(
    userId: string,
    kitchenId: string,
    dto: CreateProductDto,
  ): Promise<ProductDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const name = dto.name.trim();
    const normalizedName = normalizeProductName(name);
    if (!normalizedName) {
      throw new BadRequestException('Nazwa produktu jest wymagana.');
    }
    const ean = normalizeOptionalEan(dto.ean);
    const imageUrl = normalizeOptionalImageUrl(dto.imageUrl);
    const category = normalizeOptionalCategory(dto.category);
    try {
      const product = await this.prisma.product.create({
        data: {
          kitchenId,
          name,
          normalizedName,
          defaultUnit: dto.defaultUnit,
          ean,
          imageUrl,
          category,
        },
      });
      return toProductDto(product);
    } catch (error) {
      throw toProductWriteError(error);
    }
  }

  async deleteProduct(
    userId: string,
    kitchenId: string,
    productId: string,
    confirmCascade: boolean,
  ): Promise<void> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, kitchenId },
      include: { _count: { select: { stockItems: true } } },
    });
    if (!product) {
      throw new BadRequestException('Nie znaleziono produktu.');
    }
    if (product._count.stockItems > 0 && !confirmCascade) {
      throw new ConflictException(
        'Produkt ma partie zapasów. Potwierdź usunięcie kaskadowe.',
      );
    }
    await this.prisma.product.delete({ where: { id: product.id } });
  }

  async listStockItems(
    userId: string,
    kitchenId: string,
    filters: { productId?: string; location?: StorageLocation },
  ): Promise<StockItemDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    if (
      filters.location &&
      !Object.values(StorageLocation).includes(filters.location)
    ) {
      throw new BadRequestException('Niepoprawne miejsce przechowywania.');
    }
    const items = await this.prisma.stockItem.findMany({
      where: {
        product: { kitchenId },
        productId: filters.productId,
        location: filters.location,
      },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });
    return items.map(toStockItemDto);
  }

  async createStockItem(
    userId: string,
    kitchenId: string,
    dto: CreateStockItemDto,
  ): Promise<StockItemDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, kitchenId },
    });
    if (!product) {
      throw new BadRequestException('Nie znaleziono produktu w tej kuchni.');
    }
    const quantity = parseQuantityString(dto.quantity, 'quantity');
    assertStockQuantities(quantity, quantity);
    if (dto.purchasePriceMinor < 0) {
      throw new BadRequestException('Cena nie może być ujemna.');
    }
    const currency = (dto.currency ?? 'PLN').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException(
        'currency musi być kodem ISO 4217 (3 litery).',
      );
    }
    const ean = normalizeOptionalEan(dto.ean);
    const imageUrl = normalizeOptionalImageUrl(dto.imageUrl);

    try {
      const item = await this.prisma.$transaction(async (tx) => {
        const productPatch: Prisma.ProductUpdateInput = {};
        if (ean && !product.ean) {
          productPatch.ean = ean;
        }
        if (imageUrl && !product.imageUrl) {
          productPatch.imageUrl = imageUrl;
        }
        if (Object.keys(productPatch).length > 0) {
          await tx.product.update({
            where: { id: product.id },
            data: productPatch,
          });
        }
        return tx.stockItem.create({
          data: {
            productId: product.id,
            initialQuantity: quantity,
            quantity,
            location: dto.location,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : null,
            purchasePriceMinor: dto.purchasePriceMinor,
            currency,
            ean,
            imageUrl,
          },
        });
      });
      return toStockItemDto(item);
    } catch (error) {
      throw toProductWriteError(error);
    }
  }

  async updateStockItem(
    userId: string,
    kitchenId: string,
    stockItemId: string,
    dto: UpdateStockItemDto,
  ): Promise<StockItemDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const existing = await this.prisma.stockItem.findFirst({
      where: { id: stockItemId, product: { kitchenId } },
    });
    if (!existing) {
      throw new BadRequestException('Nie znaleziono partii.');
    }
    const quantity =
      dto.quantity !== undefined
        ? parseQuantityString(dto.quantity, 'quantity')
        : existing.quantity;
    assertStockQuantities(existing.initialQuantity, quantity);
    if (dto.purchasePriceMinor !== undefined && dto.purchasePriceMinor < 0) {
      throw new BadRequestException('Cena nie może być ujemna.');
    }
    const item = await this.prisma.stockItem.update({
      where: { id: existing.id },
      data: {
        quantity,
        location: dto.location,
        expiresAt:
          dto.expiresAt === undefined ? undefined : new Date(dto.expiresAt),
        purchasedAt:
          dto.purchasedAt === undefined ? undefined : new Date(dto.purchasedAt),
        purchasePriceMinor: dto.purchasePriceMinor,
        ean: dto.ean === undefined ? undefined : normalizeOptionalEan(dto.ean),
        imageUrl:
          dto.imageUrl === undefined
            ? undefined
            : normalizeOptionalImageUrl(dto.imageUrl),
      },
    });
    return toStockItemDto(item);
  }

  async listPurchaseOptions(
    userId: string,
    kitchenId: string,
    productId: string,
  ): Promise<PurchaseOptionDto[]> {
    const product = await this.findKitchenProduct(userId, kitchenId, productId);
    const options = await this.prisma.productPurchaseOption.findMany({
      where: { productId: product.id, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return options.map(toPurchaseOptionDto);
  }

  async createPurchaseOption(
    userId: string,
    kitchenId: string,
    productId: string,
    dto: CreatePurchaseOptionDto,
  ): Promise<PurchaseOptionDto> {
    const product = await this.findKitchenProduct(userId, kitchenId, productId);
    const contentQuantity = parseContentQuantity(dto.contentQuantity);
    assertContentUnitMatchesProduct(dto.contentUnit, product.defaultUnit);

    const isDefault = dto.isDefault ?? false;
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Nazwa opcji zakupu jest wymagana.');
    }

    const option = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.productPurchaseOption.updateMany({
          where: { productId: product.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.productPurchaseOption.create({
        data: {
          productId: product.id,
          name,
          contentQuantity,
          contentUnit: dto.contentUnit,
          isDefault,
        },
      });
    });

    return toPurchaseOptionDto(option);
  }

  async updatePurchaseOption(
    userId: string,
    kitchenId: string,
    productId: string,
    optionId: string,
    dto: UpdatePurchaseOptionDto,
  ): Promise<PurchaseOptionDto> {
    const product = await this.findKitchenProduct(userId, kitchenId, productId);
    const existing = await this.findPurchaseOption(product.id, optionId);

    const contentUnit = dto.contentUnit ?? existing.contentUnit;
    assertContentUnitMatchesProduct(contentUnit, product.defaultUnit);

    const contentQuantity =
      dto.contentQuantity !== undefined
        ? parseContentQuantity(dto.contentQuantity)
        : existing.contentQuantity;

    const option = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.productPurchaseOption.updateMany({
          where: {
            productId: product.id,
            isDefault: true,
            id: { not: existing.id },
          },
          data: { isDefault: false },
        });
      }

      return tx.productPurchaseOption.update({
        where: { id: existing.id },
        data: {
          name: dto.name?.trim(),
          contentQuantity,
          contentUnit,
          isDefault: dto.isDefault,
          isActive: dto.isActive,
        },
      });
    });

    return toPurchaseOptionDto(option);
  }

  async deletePurchaseOption(
    userId: string,
    kitchenId: string,
    productId: string,
    optionId: string,
  ): Promise<void> {
    const product = await this.findKitchenProduct(userId, kitchenId, productId);
    const existing = await this.findPurchaseOption(product.id, optionId);

    const referencedCount = await this.prisma.shoppingListItem.count({
      where: { purchaseOptionId: existing.id },
    });

    if (referencedCount > 0) {
      await this.prisma.productPurchaseOption.update({
        where: { id: existing.id },
        data: { isActive: false, isDefault: false },
      });
      return;
    }

    await this.prisma.productPurchaseOption.delete({
      where: { id: existing.id },
    });
  }

  async deleteStockItem(
    userId: string,
    kitchenId: string,
    stockItemId: string,
  ): Promise<void> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const existing = await this.prisma.stockItem.findFirst({
      where: { id: stockItemId, product: { kitchenId } },
    });
    if (!existing) {
      throw new BadRequestException('Nie znaleziono partii.');
    }
    await this.prisma.stockItem.delete({ where: { id: existing.id } });
  }

  private async findKitchenProduct(
    userId: string,
    kitchenId: string,
    productId: string,
  ): Promise<Product> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, kitchenId },
    });
    if (!product) {
      throw new BadRequestException('Nie znaleziono produktu w tej kuchni.');
    }
    return product;
  }

  private async findPurchaseOption(
    productId: string,
    optionId: string,
  ): Promise<ProductPurchaseOption> {
    const option = await this.prisma.productPurchaseOption.findFirst({
      where: { id: optionId, productId },
    });
    if (!option) {
      throw new BadRequestException('Nie znaleziono opcji zakupu.');
    }
    return option;
  }
}

function parseContentQuantity(value: string): Prisma.Decimal {
  const quantity = parseQuantityString(value, 'contentQuantity');
  if (quantity.lte(0)) {
    throw new BadRequestException('contentQuantity musi być większe od zera.');
  }
  return quantity;
}

function assertContentUnitMatchesProduct(
  contentUnit: Product['defaultUnit'],
  productUnit: Product['defaultUnit'],
): void {
  if (contentUnit !== productUnit) {
    throw new BadRequestException(
      'contentUnit musi być zgodne z defaultUnit produktu.',
    );
  }
}

function toProductWriteError(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const targetMeta = error.meta?.target;
    const target = Array.isArray(targetMeta)
      ? targetMeta.map(String).join(',')
      : typeof targetMeta === 'string'
        ? targetMeta
        : '';
    if (target.includes('ean')) {
      return new ConflictException(
        'Produkt o tym kodzie EAN już istnieje w kuchni.',
      );
    }
    return new ConflictException('Produkt o tej nazwie już istnieje w kuchni.');
  }
  return error instanceof Error ? error : new Error('Nieznany błąd zapisu.');
}

type ProductWithPurchaseOptions = Product & {
  purchaseOptions?: ProductPurchaseOption[];
};

function toProductDto(product: ProductWithPurchaseOptions): ProductDto {
  return {
    id: product.id,
    kitchenId: product.kitchenId,
    name: product.name,
    normalizedName: product.normalizedName,
    defaultUnit: product.defaultUnit,
    ean: product.ean,
    imageUrl: product.imageUrl,
    category: product.category,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    purchaseOptions: product.purchaseOptions?.map(toPurchaseOptionDto),
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

function toStockItemDto(item: StockItem): StockItemDto {
  return {
    id: item.id,
    productId: item.productId,
    initialQuantity: formatQuantity(item.initialQuantity),
    quantity: formatQuantity(item.quantity),
    location: item.location,
    expiresAt: item.expiresAt?.toISOString() ?? null,
    purchasedAt: item.purchasedAt?.toISOString() ?? null,
    purchasePriceMinor: item.purchasePriceMinor,
    currency: item.currency,
    ean: item.ean,
    imageUrl: item.imageUrl,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
