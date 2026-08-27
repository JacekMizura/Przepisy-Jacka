import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  NutritionDataSource,
  ProductPurchaseMode,
  StorageLocation,
  type MediaAsset,
  type Product,
  type ProductNutrition,
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
import { MediaImageDto } from '../media/dto/media.dto';
import { MediaService } from '../media/media.service';
import {
  ProductNutritionDto,
  UpsertProductNutritionDto,
} from './dto/product-nutrition.dto';
import {
  ConfigureProductPurchaseDto,
  CreateProductDto,
  ProductDto,
  UpdateProductDto,
} from './dto/product.dto';
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

const productInclude = {
  purchaseOptions: {
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' as const }, { name: 'asc' as const }],
  },
  imageMedia: true,
  nutrition: true,
};

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async listProducts(userId: string, kitchenId: string): Promise<ProductDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const products = await this.prisma.product.findMany({
      where: { kitchenId },
      include: productInclude,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return Promise.all(
      products.map((product) => this.toProductDtoWithMedia(product)),
    );
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
      return this.toProductDtoWithMedia({ ...product, purchaseOptions: [] });
    } catch (error) {
      throw toProductWriteError(error);
    }
  }

  async updateProduct(
    userId: string,
    kitchenId: string,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<ProductDto> {
    const product = await this.findKitchenProduct(userId, kitchenId, productId);

    if (dto.purchaseMode === undefined) {
      const options = await this.prisma.productPurchaseOption.findMany({
        where: { productId: product.id, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      });
      return this.toProductDtoWithMedia({
        ...product,
        purchaseOptions: options,
      });
    }

    if (dto.purchaseMode === ProductPurchaseMode.packaged) {
      await assertPackagedProductHasValidActiveOptions(this.prisma, product.id);
    }

    const updated = await this.prisma.product.update({
      where: { id: product.id },
      data: { purchaseMode: dto.purchaseMode },
      include: productInclude,
    });
    return this.toProductDtoWithMedia(updated);
  }

  async getProductNutrition(
    userId: string,
    kitchenId: string,
    productId: string,
  ): Promise<ProductNutritionDto | null> {
    const product = await this.findKitchenProduct(userId, kitchenId, productId);
    const nutrition = await this.prisma.productNutrition.findUnique({
      where: { productId: product.id },
    });
    return nutrition ? toProductNutritionDto(nutrition) : null;
  }

  async upsertProductNutrition(
    userId: string,
    kitchenId: string,
    productId: string,
    dto: UpsertProductNutritionDto,
  ): Promise<ProductNutritionDto> {
    const product = await this.findKitchenProduct(userId, kitchenId, productId);

    const baseQuantity = parseQuantityString(dto.baseQuantity, 'baseQuantity');
    if (baseQuantity.lte(0)) {
      throw new BadRequestException('baseQuantity musi być większe od zera.');
    }
    if (dto.baseUnit !== product.defaultUnit) {
      throw new BadRequestException(
        'baseUnit musi być zgodne z defaultUnit produktu.',
      );
    }

    const source = dto.source ?? NutritionDataSource.manual;
    if (
      source === NutritionDataSource.open_food_facts &&
      (!dto.sourceFetchedAt || dto.sourceFetchedAt.trim().length === 0)
    ) {
      throw new BadRequestException(
        'sourceFetchedAt jest wymagane przy zapisie danych z Open Food Facts.',
      );
    }

    const sourceFetchedAt =
      source === NutritionDataSource.open_food_facts && dto.sourceFetchedAt
        ? new Date(dto.sourceFetchedAt)
        : null;
    if (sourceFetchedAt !== null && Number.isNaN(sourceFetchedAt.getTime())) {
      throw new BadRequestException(
        'sourceFetchedAt musi być poprawną datą ISO.',
      );
    }

    const data = {
      baseQuantity,
      baseUnit: dto.baseUnit,
      kcal: parseQuantityString(dto.kcal, 'kcal'),
      proteinGrams: parseQuantityString(dto.proteinGrams, 'proteinGrams'),
      carbsGrams: parseQuantityString(dto.carbsGrams, 'carbsGrams'),
      fatGrams: parseQuantityString(dto.fatGrams, 'fatGrams'),
      fiberGrams: parseOptionalNutritionValue(dto.fiberGrams, 'fiberGrams'),
      saltGrams: parseOptionalNutritionValue(dto.saltGrams, 'saltGrams'),
      source,
      sourceFetchedAt,
      sourceLabel:
        source === NutritionDataSource.open_food_facts
          ? dto.sourceLabel?.trim() || null
          : null,
      sourceBrand:
        source === NutritionDataSource.open_food_facts
          ? dto.sourceBrand?.trim() || null
          : null,
    };

    const nutrition = await this.prisma.productNutrition.upsert({
      where: { productId: product.id },
      create: { productId: product.id, ...data },
      update: data,
    });
    return toProductNutritionDto(nutrition);
  }

  async configureProductPurchase(
    userId: string,
    kitchenId: string,
    productId: string,
    dto: ConfigureProductPurchaseDto,
  ): Promise<ProductDto> {
    const product = await this.findKitchenProduct(userId, kitchenId, productId);

    if (dto.mode === ProductPurchaseMode.packaged) {
      if (!dto.option) {
        throw new BadRequestException(
          'Tryb packaged wymaga opcji zakupu (option).',
        );
      }
      const contentQuantity = parseContentQuantity(dto.option.contentQuantity);
      assertContentUnitMatchesProduct(
        dto.option.contentUnit,
        product.defaultUnit,
      );
      const optionName = dto.option.name.trim();
      if (!optionName) {
        throw new BadRequestException('Nazwa opcji zakupu jest wymagana.');
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const activeCount = await tx.productPurchaseOption.count({
          where: { productId: product.id, isActive: true },
        });
        const makeDefault = dto.option!.isDefault ?? activeCount === 0;

        if (makeDefault) {
          await tx.productPurchaseOption.updateMany({
            where: { productId: product.id, isDefault: true },
            data: { isDefault: false },
          });
        }

        await tx.productPurchaseOption.create({
          data: {
            productId: product.id,
            name: optionName,
            contentQuantity,
            contentUnit: dto.option!.contentUnit,
            isDefault: makeDefault || activeCount === 0,
          },
        });

        await ensureExactlyOneDefaultAmongActive(tx, product.id);

        return tx.product.update({
          where: { id: product.id },
          data: { purchaseMode: ProductPurchaseMode.packaged },
          include: productInclude,
        });
      });
      return this.toProductDtoWithMedia(updated);
    }

    if (dto.mode === ProductPurchaseMode.exact) {
      const updated = await this.prisma.product.update({
        where: { id: product.id },
        data: { purchaseMode: ProductPurchaseMode.exact },
        include: productInclude,
      });
      return this.toProductDtoWithMedia(updated);
    }

    const updated = await this.prisma.product.update({
      where: { id: product.id },
      data: { purchaseMode: ProductPurchaseMode.unconfigured },
      include: productInclude,
    });
    return this.toProductDtoWithMedia(updated);
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

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Nazwa opcji zakupu jest wymagana.');
    }

    const option = await this.prisma.$transaction(async (tx) => {
      const activeCount = await tx.productPurchaseOption.count({
        where: { productId: product.id, isActive: true },
      });
      const isDefault = dto.isDefault ?? activeCount === 0;

      if (isDefault) {
        await tx.productPurchaseOption.updateMany({
          where: { productId: product.id, isDefault: true },
          data: { isDefault: false },
        });
      }

      const created = await tx.productPurchaseOption.create({
        data: {
          productId: product.id,
          name,
          contentQuantity,
          contentUnit: dto.contentUnit,
          isDefault,
        },
      });

      await ensureExactlyOneDefaultAmongActive(tx, product.id);

      await tx.product.update({
        where: { id: product.id },
        data: { purchaseMode: ProductPurchaseMode.packaged },
      });

      return created;
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
      if (dto.isActive === false && existing.isActive) {
        await assertCanDeactivateOrRemoveActiveOption(tx, product, existing.id);
      }

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

      const updated = await tx.productPurchaseOption.update({
        where: { id: existing.id },
        data: {
          name: dto.name?.trim(),
          contentQuantity,
          contentUnit,
          isDefault: dto.isDefault,
          isActive: dto.isActive,
        },
      });

      if (updated.isActive) {
        await ensureExactlyOneDefaultAmongActive(tx, product.id);
      } else if (product.purchaseMode === ProductPurchaseMode.packaged) {
        await assertPackagedProductHasValidActiveOptions(tx, product.id);
      }

      return updated;
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

    await this.prisma.$transaction(async (tx) => {
      if (existing.isActive) {
        await assertCanDeactivateOrRemoveActiveOption(tx, product, existing.id);
      }

      const referencedCount = await tx.shoppingListItem.count({
        where: { purchaseOptionId: existing.id },
      });

      if (referencedCount > 0) {
        await tx.productPurchaseOption.update({
          where: { id: existing.id },
          data: { isActive: false, isDefault: false },
        });
      } else {
        await tx.productPurchaseOption.delete({
          where: { id: existing.id },
        });
      }

      await ensureExactlyOneDefaultAmongActive(tx, product.id);

      if (product.purchaseMode === ProductPurchaseMode.packaged) {
        await assertPackagedProductHasValidActiveOptions(tx, product.id);
      }
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

  private async toProductDtoWithMedia(
    product: ProductWithRelations,
  ): Promise<ProductDto> {
    const image = await this.mediaService.buildImageSummary(
      product.imageMedia ?? null,
    );
    return toProductDto(product, image);
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

async function assertPackagedProductHasValidActiveOptions(
  client: Prisma.TransactionClient | PrismaService,
  productId: string,
): Promise<void> {
  const active = await client.productPurchaseOption.findMany({
    where: { productId, isActive: true },
  });
  if (active.length === 0) {
    throw new BadRequestException(
      'Tryb packaged wymaga co najmniej jednej aktywnej opcji zakupu.',
    );
  }
  const defaults = active.filter((option) => option.isDefault);
  if (defaults.length !== 1) {
    throw new BadRequestException(
      'Tryb packaged wymaga dokładnie jednej domyślnej aktywnej opcji zakupu.',
    );
  }
}

async function assertCanDeactivateOrRemoveActiveOption(
  tx: Prisma.TransactionClient,
  product: Product,
  optionId: string,
): Promise<void> {
  if (product.purchaseMode !== ProductPurchaseMode.packaged) {
    return;
  }
  const remainingActive = await tx.productPurchaseOption.count({
    where: {
      productId: product.id,
      isActive: true,
      id: { not: optionId },
    },
  });
  if (remainingActive === 0) {
    throw new BadRequestException(
      'Nie można usunąć ostatniej aktywnej opcji zakupu w trybie packaged.',
    );
  }
}

async function ensureExactlyOneDefaultAmongActive(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<void> {
  const active = await tx.productPurchaseOption.findMany({
    where: { productId, isActive: true },
    orderBy: [{ createdAt: 'asc' }],
  });
  if (active.length === 0) {
    return;
  }
  const defaults = active.filter((option) => option.isDefault);
  if (defaults.length === 1) {
    return;
  }
  if (defaults.length > 1) {
    const keep = defaults[0]!;
    await tx.productPurchaseOption.updateMany({
      where: {
        productId,
        isDefault: true,
        id: { not: keep.id },
      },
      data: { isDefault: false },
    });
    return;
  }
  await tx.productPurchaseOption.update({
    where: { id: active[0]!.id },
    data: { isDefault: true },
  });
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

type ProductWithRelations = Product & {
  purchaseOptions?: ProductPurchaseOption[];
  imageMedia?: MediaAsset | null;
  nutrition?: ProductNutrition | null;
};

function toProductDto(
  product: ProductWithRelations,
  image: MediaImageDto | null,
): ProductDto {
  return {
    id: product.id,
    kitchenId: product.kitchenId,
    name: product.name,
    normalizedName: product.normalizedName,
    defaultUnit: product.defaultUnit,
    purchaseMode: product.purchaseMode,
    ean: product.ean,
    imageUrl: product.imageUrl,
    image,
    nutrition: product.nutrition
      ? toProductNutritionDto(product.nutrition)
      : null,
    category: product.category,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    purchaseOptions: product.purchaseOptions?.map(toPurchaseOptionDto) ?? [],
  };
}

function toProductNutritionDto(
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
    updatedAt: nutrition.updatedAt.toISOString(),
  };
}

function parseOptionalNutritionValue(
  value: string | null | undefined,
  fieldName: string,
): Prisma.Decimal | null {
  if (value === undefined || value === null || value.trim().length === 0) {
    return null;
  }
  return parseQuantityString(value, fieldName);
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
