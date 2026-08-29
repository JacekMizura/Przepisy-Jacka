import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  NutritionDataSource,
  ProductPurchaseMode,
  ProductUnit,
  ShoppingListItemStatus,
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
import {
  ConsumeStockCommitDto,
  ConsumeStockPreviewDto,
  ConsumeStockPreviewResultDto,
  StockConsumptionResultDto,
  type ConsumeAllocationLineDto,
} from './dto/stock-consume.dto';
import {
  StockProductSummaryDto,
  type StockBatchDetailDto,
} from './dto/stock-summary.dto';
import {
  allocateConsumption,
  stockItemDeleteBlockReason,
  unitPriceMinor,
  type StockBatchRow,
} from './stock-consume';
import { resolveStockConsumptionKindAndReason } from './stock-consumption-kind';

const stockBatchInclude = {
  purchaseLineItem: {
    include: {
      purchase: {
        select: {
          id: true,
          storeName: true,
          receiptMediaId: true,
        },
      },
    },
  },
  _count: {
    select: { consumptionLines: true },
  },
} satisfies Prisma.StockItemInclude;

type StockItemWithPurchase = Prisma.StockItemGetPayload<{
  include: typeof stockBatchInclude;
}>;

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

  async listProducts(
    userId: string,
    kitchenId: string,
    archiveFilter: 'active' | 'archived' | 'all' = 'active',
  ): Promise<ProductDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const products = await this.prisma.product.findMany({
      where: {
        kitchenId,
        ...(archiveFilter === 'active'
          ? { archivedAt: null }
          : archiveFilter === 'archived'
            ? { archivedAt: { not: null } }
            : {}),
      },
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

    const archivedByName = await this.prisma.product.findFirst({
      where: { kitchenId, normalizedName, archivedAt: { not: null } },
      select: { id: true },
    });
    if (archivedByName) {
      throw archivedProductNameConflict(archivedByName.id);
    }
    if (ean) {
      const archivedByEan = await this.prisma.product.findFirst({
        where: { kitchenId, ean, archivedAt: { not: null } },
        select: { id: true },
      });
      if (archivedByEan) {
        throw archivedProductNameConflict(archivedByEan.id);
      }
    }

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
      (source === NutritionDataSource.open_food_facts ||
        source === NutritionDataSource.usda_fdc) &&
      (!dto.sourceFetchedAt || dto.sourceFetchedAt.trim().length === 0)
    ) {
      throw new BadRequestException(
        'sourceFetchedAt jest wymagane przy zapisie danych z Open Food Facts lub USDA.',
      );
    }
    if (
      source === NutritionDataSource.usda_fdc &&
      (!dto.sourceGenericFoodId || dto.sourceGenericFoodId.trim().length === 0)
    ) {
      throw new BadRequestException(
        'sourceGenericFoodId jest wymagane przy zapisie danych z katalogu USDA.',
      );
    }
    if (
      source === NutritionDataSource.usda_fdc &&
      dto.baseUnit === ProductUnit.piece &&
      (!dto.sourcePieceGrams || dto.sourcePieceGrams.trim().length === 0)
    ) {
      throw new BadRequestException(
        'sourcePieceGrams jest wymagane przy zapisie USDA dla jednostki szt.',
      );
    }

    const sourceFetchedAt =
      (source === NutritionDataSource.open_food_facts ||
        source === NutritionDataSource.usda_fdc) &&
      dto.sourceFetchedAt
        ? new Date(dto.sourceFetchedAt)
        : null;
    if (sourceFetchedAt !== null && Number.isNaN(sourceFetchedAt.getTime())) {
      throw new BadRequestException(
        'sourceFetchedAt musi być poprawną datą ISO.',
      );
    }

    let sourceGenericFoodId: string | null = null;
    let sourceFdcId: number | null = null;
    let sourcePieceGrams: Prisma.Decimal | null = null;
    if (source === NutritionDataSource.usda_fdc) {
      sourceGenericFoodId = dto.sourceGenericFoodId!.trim();
      const catalogEntry = await this.prisma.usdaFoodCatalogEntry.findUnique({
        where: { id: sourceGenericFoodId },
        select: { id: true, fdcId: true },
      });
      if (!catalogEntry) {
        throw new BadRequestException(
          'sourceGenericFoodId nie wskazuje na istniejący wpis katalogu USDA.',
        );
      }
      sourceFdcId =
        dto.sourceFdcId !== undefined && dto.sourceFdcId !== null
          ? dto.sourceFdcId
          : catalogEntry.fdcId;
      sourcePieceGrams = parseOptionalNutritionValue(
        dto.sourcePieceGrams,
        'sourcePieceGrams',
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
        source === NutritionDataSource.open_food_facts ||
        source === NutritionDataSource.usda_fdc
          ? dto.sourceLabel?.trim() || null
          : null,
      sourceBrand:
        source === NutritionDataSource.open_food_facts
          ? dto.sourceBrand?.trim() || null
          : null,
      sourceGenericFoodId,
      sourceFdcId,
      sourcePieceGrams,
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
    options: { permanent?: boolean } = {},
  ): Promise<ProductDto | void> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, kitchenId },
      include: {
        _count: {
          select: {
            stockItems: true,
            purchaseLineItems: true,
            stockConsumptions: true,
            recipeIngredients: true,
            shoppingListItems: true,
            purchaseOptions: true,
          },
        },
      },
    });
    if (!product) {
      throw new BadRequestException('Nie znaleziono produktu.');
    }

    if (options.permanent) {
      const hasHistory =
        product._count.stockItems > 0 ||
        product._count.purchaseLineItems > 0 ||
        product._count.stockConsumptions > 0 ||
        product._count.recipeIngredients > 0 ||
        product._count.shoppingListItems > 0 ||
        product._count.purchaseOptions > 0 ||
        product.archivedAt !== null;
      if (hasHistory) {
        throw new ConflictException(
          'Trwałe usunięcie jest dozwolone wyłącznie dla produktu nigdy nieużytego i bez archiwum. Użyj archiwizacji.',
        );
      }
      const nutrition = await this.prisma.productNutrition.findUnique({
        where: { productId: product.id },
        select: { productId: true },
      });
      if (nutrition) {
        throw new ConflictException(
          'Trwałe usunięcie jest dozwolone wyłącznie dla produktu nigdy nieużytego. Użyj archiwizacji.',
        );
      }
      try {
        await this.prisma.product.delete({ where: { id: product.id } });
      } catch (error) {
        throw toProductWriteError(error);
      }
      return;
    }

    if (product.archivedAt) {
      throw new ConflictException('Produkt jest już zarchiwizowany.');
    }

    const pendingShopping = await this.prisma.shoppingListItem.count({
      where: {
        productId: product.id,
        status: ShoppingListItemStatus.pending,
        shoppingList: { kitchenId },
      },
    });
    if (pendingShopping > 0) {
      throw new ConflictException(
        'Produkt ma oczekującą pozycję na liście zakupów. Usuń lub rozlicz ją przed archiwizacją.',
      );
    }

    const archived = await this.prisma.product.update({
      where: { id: product.id },
      data: { archivedAt: new Date() },
      include: productInclude,
    });
    return this.toProductDtoWithMedia(archived);
  }

  async restoreProduct(
    userId: string,
    kitchenId: string,
    productId: string,
  ): Promise<ProductDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, kitchenId },
    });
    if (!product) {
      throw new BadRequestException('Nie znaleziono produktu.');
    }
    if (!product.archivedAt) {
      throw new ConflictException('Produkt nie jest zarchiwizowany.');
    }
    const restored = await this.prisma.product.update({
      where: { id: product.id },
      data: { archivedAt: null },
      include: productInclude,
    });
    return this.toProductDtoWithMedia(restored);
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
    assertProductNotArchived(product);
    const quantity = parseQuantityString(dto.quantity, 'quantity');
    assertStockQuantities(quantity, quantity);
    const priceMinor =
      dto.purchasePriceMinor === undefined ? null : dto.purchasePriceMinor;
    if (priceMinor !== null && priceMinor < 0) {
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
            purchasePriceMinor: priceMinor,
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
    if (
      dto.purchasePriceMinor !== undefined &&
      dto.purchasePriceMinor !== null &&
      dto.purchasePriceMinor < 0
    ) {
      throw new BadRequestException('Cena nie może być ujemna.');
    }
    const item = await this.prisma.stockItem.update({
      where: { id: existing.id },
      data: {
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

  async listStockSummary(
    userId: string,
    kitchenId: string,
    filters: { location?: StorageLocation; productId?: string },
  ): Promise<StockProductSummaryDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const now = new Date();
    const items = await this.prisma.stockItem.findMany({
      where: {
        product: { kitchenId },
        productId: filters.productId,
        location: filters.location,
        quantity: { gt: 0 },
      },
      include: {
        product: true,
        ...stockBatchInclude,
      },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });

    const byProduct = new Map<string, StockProductSummaryDto>();
    for (const item of items) {
      let summary = byProduct.get(item.productId);
      if (!summary) {
        summary = {
          productId: item.product.id,
          productName: item.product.name,
          defaultUnit: item.product.defaultUnit,
          category: item.product.category,
          isArchived: item.product.archivedAt !== null,
          totalQuantity: '0.000',
          batchCount: 0,
          expiringBatchCount: 0,
          nearestExpiry: null,
          batches: [],
        };
        byProduct.set(item.productId, summary);
      }
      const batch = toStockBatchDetailDto(item, now);
      summary.batches.push(batch);
      summary.batchCount += 1;
      if (
        batch.expiresAt &&
        new Date(batch.expiresAt) <= new Date(now.getTime() + 7 * 86400000)
      ) {
        summary.expiringBatchCount += 1;
      }
      if (batch.expiresAt) {
        if (!summary.nearestExpiry || batch.expiresAt < summary.nearestExpiry) {
          summary.nearestExpiry = batch.expiresAt;
        }
      }
      const total = new Prisma.Decimal(summary.totalQuantity).add(
        item.quantity,
      );
      summary.totalQuantity = formatQuantity(total);
    }

    return Array.from(byProduct.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName, 'pl'),
    );
  }

  async previewConsumeStock(
    userId: string,
    kitchenId: string,
    productId: string,
    dto: ConsumeStockPreviewDto,
  ): Promise<ConsumeStockPreviewResultDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    await this.findKitchenProduct(userId, kitchenId, productId);
    const requested = parseQuantityString(dto.quantity, 'quantity');
    const batches = await this.loadProductBatches(kitchenId, productId);
    const manualLines = dto.manualLines?.map((line) => ({
      stockItemId: line.stockItemId,
      quantity: parseQuantityString(line.quantity, 'quantity'),
    }));
    const allocation = allocateConsumption(
      batches,
      requested,
      new Date(),
      manualLines,
    );
    return this.toConsumePreviewDto(allocation, requested, batches);
  }

  async commitConsumeStock(
    userId: string,
    kitchenId: string,
    productId: string,
    dto: ConsumeStockCommitDto,
  ): Promise<StockConsumptionResultDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    await this.findKitchenProduct(userId, kitchenId, productId);

    const existing = await this.prisma.stockConsumption.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { lines: true },
    });
    if (existing) {
      if (
        existing.kitchenId !== kitchenId ||
        existing.productId !== productId
      ) {
        throw new ConflictException('Klucz idempotencji jest już użyty.');
      }
      return toStockConsumptionResultDto(existing);
    }

    const { kind, reason } = resolveStockConsumptionKindAndReason(dto);

    const requested = parseQuantityString(dto.quantity, 'quantity');
    const manualLines = dto.manualLines?.map((line) => ({
      stockItemId: line.stockItemId,
      quantity: parseQuantityString(line.quantity, 'quantity'),
    }));

    const result = await this.prisma.$transaction(async (tx) => {
      const batchRows = await tx.stockItem.findMany({
        where: { productId, product: { kitchenId } },
        orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
      });
      const batches: StockBatchRow[] = batchRows.map(toStockBatchRow);
      const allocation = allocateConsumption(
        batches,
        requested,
        new Date(),
        manualLines,
      );
      if (allocation.fingerprint !== dto.previewFingerprint) {
        throw new ConflictException(
          'Stan partii zmienił się od podglądu — odśwież propozycję i zatwierdź ponownie.',
        );
      }
      if (allocation.insufficientQuantity) {
        throw new BadRequestException(
          `Niewystarczający stan — brakuje ${formatQuantity(allocation.insufficientQuantity)}.`,
        );
      }

      for (const line of allocation.lines) {
        const batch = await tx.stockItem.findFirst({
          where: {
            id: line.stockItemId,
            productId,
            product: { kitchenId },
          },
        });
        if (!batch || batch.quantity.lt(line.quantity)) {
          throw new ConflictException(
            'Stan partii zmienił się w trakcie zatwierdzania — odśwież podgląd.',
          );
        }
        const nextQty = batch.quantity.sub(line.quantity);
        await tx.stockItem.update({
          where: { id: batch.id },
          data: { quantity: nextQty },
        });
      }

      const consumption = await tx.stockConsumption.create({
        data: {
          kitchenId,
          productId,
          idempotencyKey: dto.idempotencyKey,
          kind,
          reason,
          totalQuantity: allocation.totalQuantity,
          totalCostMinor: allocation.totalCostMinor,
          costComplete: allocation.costComplete,
          previewFingerprint: dto.previewFingerprint,
          createdByUserId: userId,
          lines: {
            create: allocation.lines.map((line) => ({
              stockItemId: line.stockItemId,
              quantity: line.quantity,
              costMinor: line.costMinor,
            })),
          },
        },
        include: { lines: true },
      });
      return consumption;
    });

    return toStockConsumptionResultDto(result);
  }

  async reverseConsumption(
    userId: string,
    kitchenId: string,
    consumptionId: string,
    idempotencyKey: string,
  ): Promise<StockConsumptionResultDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);

    const existingReversal = await this.prisma.stockConsumption.findUnique({
      where: { idempotencyKey },
      include: { lines: true },
    });
    if (existingReversal) {
      return toStockConsumptionResultDto(existingReversal);
    }

    const original = await this.prisma.stockConsumption.findFirst({
      where: { id: consumptionId, kitchenId },
      include: { lines: true, reversalOf: true },
    });
    if (!original) {
      throw new BadRequestException('Nie znaleziono zużycia do cofnięcia.');
    }
    if (original.reversesConsumptionId) {
      throw new BadRequestException(
        'Nie można cofnąć rekordu będącego cofnięciem innego zużycia.',
      );
    }
    if (original.reversalOf) {
      throw new BadRequestException('To zużycie zostało już cofnięte.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      for (const line of original.lines) {
        const batch = await tx.stockItem.findUnique({
          where: { id: line.stockItemId },
        });
        if (!batch) {
          throw new BadRequestException('Partia zużycia już nie istnieje.');
        }
        const nextQty = batch.quantity.add(line.quantity);
        assertStockQuantities(batch.initialQuantity, nextQty);
        await tx.stockItem.update({
          where: { id: batch.id },
          data: { quantity: nextQty },
        });
      }

      return tx.stockConsumption.create({
        data: {
          kitchenId,
          productId: original.productId,
          idempotencyKey,
          kind: original.kind,
          reason: original.reason,
          totalQuantity: original.totalQuantity,
          totalCostMinor: original.totalCostMinor,
          costComplete: original.costComplete,
          previewFingerprint: original.previewFingerprint,
          createdByUserId: userId,
          reversesConsumptionId: original.id,
          lines: {
            create: original.lines.map((line) => ({
              stockItemId: line.stockItemId,
              quantity: line.quantity,
              costMinor: line.costMinor,
            })),
          },
        },
        include: { lines: true },
      });
    });

    return toStockConsumptionResultDto(result);
  }

  async listConsumptions(
    userId: string,
    kitchenId: string,
    filters: { productId?: string; limit?: number },
  ): Promise<StockConsumptionResultDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
    const rows = await this.prisma.stockConsumption.findMany({
      where: {
        kitchenId,
        productId: filters.productId,
      },
      include: {
        lines: {
          include: {
            stockItem: {
              include: {
                purchaseLineItem: {
                  include: {
                    purchase: { select: { storeName: true } },
                  },
                },
              },
            },
          },
        },
        product: { select: { name: true } },
        reversalOf: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      ...toStockConsumptionResultDto(row, {
        productName: row.product.name,
        isReversed: Boolean(row.reversalOf),
      }),
      lines: row.lines.map((line) => ({
        stockItemId: line.stockItemId,
        quantity: formatQuantity(line.quantity),
        costMinor: line.costMinor,
        storeName: line.stockItem.purchaseLineItem?.purchase.storeName ?? null,
      })),
    }));
  }

  private async loadProductBatches(
    kitchenId: string,
    productId: string,
  ): Promise<StockBatchRow[]> {
    const rows = await this.prisma.stockItem.findMany({
      where: { productId, product: { kitchenId } },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toStockBatchRow);
  }

  private async toConsumePreviewDto(
    allocation: ReturnType<typeof allocateConsumption>,
    requested: Prisma.Decimal,
    batches: StockBatchRow[],
  ): Promise<ConsumeStockPreviewResultDto> {
    const batchMeta = await this.prisma.stockItem.findMany({
      where: { id: { in: batches.map((b) => b.id) } },
      include: stockBatchInclude,
    });
    const metaById = new Map(batchMeta.map((b) => [b.id, b]));

    const lines: ConsumeAllocationLineDto[] = allocation.lines.map((line) => {
      const meta = metaById.get(line.stockItemId);
      const batch = batches.find((b) => b.id === line.stockItemId);
      const isExpired =
        batch?.expiresAt !== null &&
        batch?.expiresAt !== undefined &&
        batch.expiresAt <= new Date();
      return {
        stockItemId: line.stockItemId,
        quantity: formatQuantity(line.quantity),
        costMinor: line.costMinor,
        storeName: meta?.purchaseLineItem?.purchase.storeName ?? null,
        expiresAt: meta?.expiresAt?.toISOString() ?? null,
        purchasedAt: meta?.purchasedAt?.toISOString() ?? null,
        remainingQuantity: batch
          ? formatQuantity(batch.quantity)
          : formatQuantity(new Prisma.Decimal(0)),
        purchasePriceMinor: batch?.purchasePriceMinor ?? null,
        isExpired,
      };
    });

    return {
      quantity: formatQuantity(requested),
      lines,
      totalQuantity: formatQuantity(allocation.totalQuantity),
      totalCostMinor: allocation.totalCostMinor,
      costComplete: allocation.costComplete,
      previewFingerprint: allocation.fingerprint,
      insufficientQuantity: allocation.insufficientQuantity
        ? formatQuantity(allocation.insufficientQuantity)
        : null,
      disclaimer:
        'Koszt liczony z oryginalnej ceny partii ÷ oryginalna ilość × zużyta ilość. Brak ceny nie oznacza zera.',
    };
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
      include: {
        purchaseLineItem: { select: { id: true } },
        _count: { select: { consumptionLines: true } },
      },
    });
    if (!existing) {
      throw new BadRequestException('Nie znaleziono partii.');
    }
    const block = stockItemDeleteBlockReason({
      hasPurchaseLink: existing.purchaseLineItem !== null,
      consumptionLineCount: existing._count.consumptionLines,
    });
    if (block) {
      throw new ConflictException(block);
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
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2003' || error.code === 'P2014')
  ) {
    return new ConflictException(
      'Nie można trwale usunąć produktu powiązanego z historią. Użyj archiwizacji.',
    );
  }
  return error instanceof Error ? error : new Error('Nieznany błąd zapisu.');
}

function archivedProductNameConflict(productId: string): ConflictException {
  return new ConflictException({
    code: 'PRODUCT_ARCHIVED_EXISTS',
    productId,
    message:
      'Produkt o tej nazwie jest w archiwum. Przywróć go zamiast tworzyć nowy.',
  });
}

function assertProductNotArchived(product: { archivedAt: Date | null }): void {
  if (product.archivedAt !== null) {
    throw new ConflictException(
      'Produkt jest zarchiwizowany. Przywróć go, zanim dodasz nowe zakupy lub partie.',
    );
  }
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
    archivedAt: product.archivedAt?.toISOString() ?? null,
    isArchived: product.archivedAt !== null,
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
    sourceGenericFoodId: nutrition.sourceGenericFoodId,
    sourceFdcId: nutrition.sourceFdcId,
    sourcePieceGrams:
      nutrition.sourcePieceGrams !== null
        ? formatQuantity(nutrition.sourcePieceGrams)
        : null,
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

function toStockBatchRow(item: StockItem): StockBatchRow {
  return {
    id: item.id,
    quantity: item.quantity,
    initialQuantity: item.initialQuantity,
    purchasePriceMinor: item.purchasePriceMinor,
    expiresAt: item.expiresAt,
    purchasedAt: item.purchasedAt,
    createdAt: item.createdAt,
  };
}

function toStockBatchDetailDto(
  item: StockItemWithPurchase,
  now: Date,
): StockBatchDetailDto {
  const deleteBlockReason = stockItemDeleteBlockReason({
    hasPurchaseLink: item.purchaseLineItem !== null,
    consumptionLineCount: item._count.consumptionLines,
  });
  return {
    id: item.id,
    quantity: formatQuantity(item.quantity),
    initialQuantity: formatQuantity(item.initialQuantity),
    location: item.location,
    expiresAt: item.expiresAt?.toISOString() ?? null,
    purchasedAt: item.purchasedAt?.toISOString() ?? null,
    purchasePriceMinor: item.purchasePriceMinor,
    currency: item.currency,
    unitPriceMinor: unitPriceMinor(
      item.initialQuantity,
      item.purchasePriceMinor,
    ),
    storeName: item.purchaseLineItem?.purchase.storeName ?? null,
    purchaseId: item.purchaseLineItem?.purchase.id ?? null,
    receiptMediaId: item.purchaseLineItem?.purchase.receiptMediaId ?? null,
    isExpired: item.expiresAt !== null && item.expiresAt <= now,
    canDelete: deleteBlockReason === null,
    deleteBlockReason,
    createdAt: item.createdAt.toISOString(),
  };
}

function toStockConsumptionResultDto(
  consumption: Prisma.StockConsumptionGetPayload<{ include: { lines: true } }>,
  extras?: { productName?: string; isReversed?: boolean },
): StockConsumptionResultDto {
  return {
    id: consumption.id,
    productId: consumption.productId,
    productName: extras?.productName,
    kind: consumption.kind,
    reason: consumption.reason,
    totalQuantity: formatQuantity(consumption.totalQuantity),
    totalCostMinor: consumption.totalCostMinor,
    costComplete: consumption.costComplete,
    lines: consumption.lines.map((line) => ({
      stockItemId: line.stockItemId,
      quantity: formatQuantity(line.quantity),
      costMinor: line.costMinor,
      storeName: null,
    })),
    createdAt: consumption.createdAt.toISOString(),
    reversesConsumptionId: consumption.reversesConsumptionId,
    isReversal: consumption.reversesConsumptionId !== null,
    isReversed: extras?.isReversed ?? false,
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
