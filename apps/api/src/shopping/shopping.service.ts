import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  ProductPurchaseMode,
  ProductUnit,
  ShoppingInputUnit,
  ShoppingListItemStatus,
  type MediaAsset,
  type Product,
  type ProductPurchaseOption,
  type Purchase,
  type PurchaseLineItem,
  type ShoppingList,
  type ShoppingListItem,
} from '../generated/prisma/client';

import { normalizeProductName } from '../common/normalize';
import {
  assertStockQuantities,
  formatQuantity,
  parseQuantityString,
} from '../common/quantity';
import { requireKitchenMember } from '../kitchens/kitchen-access';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_PURCHASE_CONFIG_REQUIRED_MESSAGE } from '../stock/purchase-mode.messages';
import {
  CheckoutPurchaseDto,
  CheckoutPurchaseLineDto,
  PurchaseDetailDto,
  PurchaseLineItemDto,
  PurchasePreviewProductDto,
  PurchaseSummaryDto,
} from './dto/purchase.dto';
import {
  CreateShoppingListItemDto,
  ShoppingListItemDto,
  ShoppingListItemProductDto,
  UpdateShoppingListItemDto,
} from './dto/shopping-list-item.dto';
import { PurchaseOptionSummaryDto } from '../stock/dto/purchase-option.dto';
import { productUnitToShoppingInputUnit } from './purchase-proposal';

const shoppingItemInclude = {
  product: { include: { imageMedia: true } },
  purchaseOption: true,
} as const;

const purchaseLineInclude = {
  product: { include: { imageMedia: true } },
} as const;

type ProductWithImageMedia = Product & {
  imageMedia?: MediaAsset | null;
};

type ShoppingListItemWithProduct = ShoppingListItem & {
  product: ProductWithImageMedia | null;
  purchaseOption?: ProductPurchaseOption | null;
};

type PurchaseLineWithRelations = PurchaseLineItem & {
  product: ProductWithImageMedia;
};

type PurchaseWithLines = Purchase & {
  items: PurchaseLineWithRelations[];
  receiptMedia?: MediaAsset | null;
};

const INPUT_UNIT_BASE: Record<
  ShoppingInputUnit,
  { base: 'piece' | 'gram' | 'milliliter'; factor: number }
> = {
  [ShoppingInputUnit.piece]: { base: 'piece', factor: 1 },
  [ShoppingInputUnit.gram]: { base: 'gram', factor: 1 },
  [ShoppingInputUnit.kilogram]: { base: 'gram', factor: 1000 },
  [ShoppingInputUnit.milliliter]: { base: 'milliliter', factor: 1 },
  [ShoppingInputUnit.liter]: { base: 'milliliter', factor: 1000 },
};

const PRODUCT_UNIT_BASE: Record<ProductUnit, 'piece' | 'gram' | 'milliliter'> =
  {
    [ProductUnit.piece]: 'piece',
    [ProductUnit.gram]: 'gram',
    [ProductUnit.milliliter]: 'milliliter',
  };

@Injectable()
export class ShoppingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async listShoppingListItems(
    userId: string,
    kitchenId: string,
  ): Promise<ShoppingListItemDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const items = await this.prisma.shoppingListItem.findMany({
      where: {
        shoppingList: { kitchenId },
        resolvedAt: null,
      },
      include: shoppingItemInclude,
      orderBy: [{ status: 'asc' }, { id: 'asc' }],
    });
    return Promise.all(items.map((item) => this.toShoppingListItemDto(item)));
  }

  async createShoppingListItem(
    userId: string,
    kitchenId: string,
    dto: CreateShoppingListItemDto,
  ): Promise<ShoppingListItemDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    return this.prisma.$transaction(async (tx) => {
      return this.createShoppingListItemInTx(tx, kitchenId, dto);
    });
  }

  /**
   * Tworzy / scala pozycję listy zakupów w istniejącej transakcji
   * (bez osobnego sprawdzenia członkostwa — caller odpowiada za dostęp).
   */
  async createShoppingListItemInTx(
    tx: Prisma.TransactionClient,
    kitchenId: string,
    dto: CreateShoppingListItemDto,
  ): Promise<ShoppingListItemDto> {
    validateCreateShoppingListItem(dto);

    const plannedQuantity =
      dto.plannedQuantity !== undefined
        ? parseQuantityString(dto.plannedQuantity, 'plannedQuantity')
        : null;

    const requiredQuantity =
      dto.requiredQuantity !== undefined
        ? parseQuantityString(dto.requiredQuantity, 'requiredQuantity')
        : null;

    if (
      (plannedQuantity !== null && dto.plannedUnit === undefined) ||
      (plannedQuantity === null && dto.plannedUnit !== undefined)
    ) {
      throw new BadRequestException(
        'plannedQuantity i plannedUnit muszą być podane razem.',
      );
    }

    if (
      (requiredQuantity !== null && dto.requiredUnit === undefined) ||
      (requiredQuantity === null && dto.requiredUnit !== undefined)
    ) {
      throw new BadRequestException(
        'requiredQuantity i requiredUnit muszą być podane razem.',
      );
    }

    if (
      (dto.purchaseOptionId && !dto.packageCount) ||
      (!dto.purchaseOptionId && dto.packageCount)
    ) {
      throw new BadRequestException(
        'purchaseOptionId i packageCount muszą być podane razem.',
      );
    }

    let product: Product | null = null;
    let purchaseOption: ProductPurchaseOption | null = null;
    let plannedQuantityResolved = plannedQuantity;
    let plannedUnitResolved = dto.plannedUnit;

    if (dto.productId) {
      product = await tx.product.findFirst({
        where: { id: dto.productId, kitchenId },
      });
      if (!product) {
        throw new BadRequestException('Nie znaleziono produktu w tej kuchni.');
      }

      assertProductPurchaseModeForCreate(product, dto);

      if (dto.plannedUnit) {
        assertInputUnitCompatibleWithProduct(
          dto.plannedUnit,
          product.defaultUnit,
        );
      }
      if (dto.requiredUnit) {
        assertInputUnitCompatibleWithProduct(
          dto.requiredUnit,
          product.defaultUnit,
        );
      }
      if (dto.purchaseOptionId) {
        purchaseOption = await tx.productPurchaseOption.findFirst({
          where: {
            id: dto.purchaseOptionId,
            productId: product.id,
            isActive: true,
          },
        });
        if (!purchaseOption) {
          throw new BadRequestException('Nie znaleziono opcji zakupu.');
        }
        if (
          product.purchaseMode === ProductPurchaseMode.packaged &&
          dto.packageCount
        ) {
          plannedQuantityResolved = purchaseOption.contentQuantity.mul(
            dto.packageCount,
          );
          plannedUnitResolved = productUnitToShoppingInputUnit(
            purchaseOption.contentUnit,
          );
        }
      }
    }

    const shoppingList = await ensureShoppingList(tx, kitchenId);

    if (dto.productId) {
      const item = await upsertPendingProductListItem(
        tx,
        shoppingList,
        {
          ...dto,
          plannedUnit: plannedUnitResolved,
          plannedQuantity:
            plannedQuantityResolved !== null
              ? formatQuantity(plannedQuantityResolved)
              : dto.plannedQuantity,
        },
        plannedQuantityResolved,
        requiredQuantity,
        purchaseOption,
      );
      return this.toShoppingListItemDto(item);
    }

    const created = await tx.shoppingListItem.create({
      data: buildShoppingListItemCreateData({
        shoppingListId: shoppingList.id,
        dto,
        plannedQuantity,
        requiredQuantity,
        purchaseOptionId: null,
        packageCount: null,
      }),
      include: shoppingItemInclude,
    });
    await touchShoppingListUpdatedAt(tx, shoppingList.id);
    return this.toShoppingListItemDto(created);
  }

  async updateShoppingListItem(
    userId: string,
    kitchenId: string,
    itemId: string,
    dto: UpdateShoppingListItemDto,
  ): Promise<ShoppingListItemDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const existing = await this.findActiveShoppingListItem(kitchenId, itemId);
    assertNotResolved(existing);

    const convertingToPackages =
      dto.purchaseOptionId !== undefined && dto.packageCount !== undefined;

    if (
      (dto.purchaseOptionId !== undefined && dto.packageCount === undefined) ||
      (dto.purchaseOptionId === undefined && dto.packageCount !== undefined)
    ) {
      throw new BadRequestException(
        'purchaseOptionId i packageCount muszą być podane razem.',
      );
    }

    let purchaseOption: ProductPurchaseOption | null = null;
    let plannedQuantity =
      dto.plannedQuantity !== undefined
        ? parseQuantityString(dto.plannedQuantity, 'plannedQuantity')
        : undefined;
    let plannedUnit = dto.plannedUnit;

    if (convertingToPackages) {
      if (!existing.productId || !existing.product) {
        throw new BadRequestException(
          'Konwersja na opakowania wymaga pozycji powiązanej z produktem.',
        );
      }
      if (existing.product.purchaseMode === ProductPurchaseMode.unconfigured) {
        throw new BadRequestException(PRODUCT_PURCHASE_CONFIG_REQUIRED_MESSAGE);
      }
      if (existing.product.purchaseMode === ProductPurchaseMode.exact) {
        throw new BadRequestException(
          'Produkt w trybie dokładnej ilości nie używa opakowań. Zmień purchaseMode na packaged.',
        );
      }
      purchaseOption = await this.prisma.productPurchaseOption.findFirst({
        where: {
          id: dto.purchaseOptionId!,
          productId: existing.productId,
          isActive: true,
        },
      });
      if (!purchaseOption) {
        throw new BadRequestException('Nie znaleziono opcji zakupu.');
      }
      plannedQuantity = purchaseOption.contentQuantity.mul(dto.packageCount!);
      plannedUnit = productUnitToShoppingInputUnit(purchaseOption.contentUnit);
    } else {
      if (
        (plannedQuantity !== undefined && plannedUnit === undefined) ||
        (plannedQuantity === undefined && plannedUnit !== undefined)
      ) {
        throw new BadRequestException(
          'plannedQuantity i plannedUnit muszą być podane razem.',
        );
      }

      const resolvedPlannedUnit = plannedUnit ?? existing.plannedUnit;
      if (resolvedPlannedUnit && existing.product) {
        assertInputUnitCompatibleWithProduct(
          resolvedPlannedUnit,
          existing.product.defaultUnit,
        );
      }
    }

    const clearPackagesForExact =
      !convertingToPackages &&
      existing.product?.purchaseMode === ProductPurchaseMode.exact;

    const item = await this.prisma.shoppingListItem.update({
      where: { id: existing.id },
      data: {
        customName:
          dto.customName !== undefined ? dto.customName.trim() : undefined,
        plannedQuantity,
        plannedUnit,
        requiredQuantity:
          dto.requiredQuantity !== undefined
            ? parseQuantityString(dto.requiredQuantity, 'requiredQuantity')
            : undefined,
        requiredUnit: dto.requiredUnit,
        purchaseOptionId: convertingToPackages
          ? purchaseOption!.id
          : clearPackagesForExact
            ? null
            : dto.purchaseOptionId,
        packageCount: convertingToPackages
          ? dto.packageCount
          : clearPackagesForExact
            ? null
            : dto.packageCount,
        note:
          dto.note === undefined ? undefined : normalizeOptionalNote(dto.note),
      },
      include: shoppingItemInclude,
    });
    return this.toShoppingListItemDto(item);
  }

  async updateShoppingListItemStatus(
    userId: string,
    kitchenId: string,
    itemId: string,
    status: ShoppingListItemStatus,
  ): Promise<ShoppingListItemDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const existing = await this.findActiveShoppingListItem(kitchenId, itemId);
    assertNotResolved(existing);

    const item = await this.prisma.shoppingListItem.update({
      where: { id: existing.id },
      data: { status },
      include: shoppingItemInclude,
    });
    return this.toShoppingListItemDto(item);
  }

  async deleteShoppingListItem(
    userId: string,
    kitchenId: string,
    itemId: string,
  ): Promise<void> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const existing = await this.findActiveShoppingListItem(kitchenId, itemId);
    assertNotResolved(existing);
    await this.prisma.shoppingListItem.delete({ where: { id: existing.id } });
  }

  async checkoutPurchase(
    userId: string,
    kitchenId: string,
    dto: CheckoutPurchaseDto,
  ): Promise<PurchaseDetailDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);

    const existing = await this.prisma.purchase.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: {
        receiptMedia: true,
        items: { include: purchaseLineInclude },
      },
    });
    if (existing) {
      if (existing.kitchenId !== kitchenId) {
        throw new ConflictException('Klucz idempotencji jest już użyty.');
      }
      return this.toPurchaseDetailDto(existing);
    }

    const currency = (dto.currency ?? 'PLN').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException(
        'currency musi być kodem ISO 4217 (3 litery).',
      );
    }
    const purchasedAt = dto.purchasedAt
      ? new Date(dto.purchasedAt)
      : new Date();
    const storeName = normalizeOptionalStoreName(dto.storeName);

    const purchase = await this.prisma.$transaction(async (tx) => {
      const shoppingList = await tx.shoppingList.findUnique({
        where: { kitchenId },
      });
      if (!shoppingList) {
        throw new BadRequestException('Brak listy zakupów w tej kuchni.');
      }

      const listItems = await tx.shoppingListItem.findMany({
        where: {
          shoppingListId: shoppingList.id,
          id: { in: dto.lines.map((line) => line.shoppingListItemId) },
        },
        include: shoppingItemInclude,
      });
      const listItemById = new Map(listItems.map((item) => [item.id, item]));

      let totalPriceMinor = 0;
      const resolvedAt = new Date();
      const lineCreates: Array<{
        line: CheckoutPurchaseLineDto;
        listItem: ShoppingListItemWithProduct;
        product: ProductWithImageMedia;
        stockQuantity: Prisma.Decimal;
        displayName: string | null;
      }> = [];

      for (const line of dto.lines) {
        if (line.priceMinor < 0) {
          throw new BadRequestException('Cena linii nie może być ujemna.');
        }
        totalPriceMinor += line.priceMinor;

        const listItem = listItemById.get(line.shoppingListItemId);
        if (!listItem) {
          throw new BadRequestException(
            'Nie znaleziono pozycji listy zakupów.',
          );
        }
        if (listItem.status !== ShoppingListItemStatus.bought) {
          throw new BadRequestException(
            'Checkout wymaga pozycji ze statusem bought.',
          );
        }
        if (listItem.resolvedAt !== null) {
          throw new BadRequestException(
            'Pozycja listy zakupów została już rozliczona.',
          );
        }

        const product = await resolveCheckoutProduct(
          tx,
          kitchenId,
          line,
          listItem,
        );
        assertProductPurchaseModeForCheckout(product, listItem);
        const stockQuantity = resolveCheckoutStockQuantity(
          line,
          listItem,
          product,
        );
        assertStockQuantities(stockQuantity, stockQuantity);

        lineCreates.push({
          line,
          listItem,
          product,
          stockQuantity,
          displayName: listItem.customName,
        });
      }

      const createdPurchase = await tx.purchase.create({
        data: {
          kitchenId,
          storeName,
          purchasedAt,
          currency,
          totalPriceMinor,
          idempotencyKey: dto.idempotencyKey,
          createdByUserId: userId,
        },
      });

      const createdLines: PurchaseLineWithRelations[] = [];
      for (const entry of lineCreates) {
        const stockItem = await tx.stockItem.create({
          data: {
            productId: entry.product.id,
            initialQuantity: entry.stockQuantity,
            quantity: entry.stockQuantity,
            location: entry.line.location,
            expiresAt: entry.line.expiresAt
              ? new Date(entry.line.expiresAt)
              : null,
            purchasedAt,
            purchasePriceMinor: entry.line.priceMinor,
            currency,
          },
        });

        const purchaseLine = await tx.purchaseLineItem.create({
          data: {
            purchaseId: createdPurchase.id,
            productId: entry.product.id,
            stockItemId: stockItem.id,
            shoppingListItemId: entry.listItem.id,
            quantity: entry.stockQuantity,
            priceMinor: entry.line.priceMinor,
            location: entry.line.location,
            expiresAt: entry.line.expiresAt
              ? new Date(entry.line.expiresAt)
              : null,
            displayName: entry.displayName,
          },
          include: purchaseLineInclude,
        });
        createdLines.push(purchaseLine);

        await tx.shoppingListItem.update({
          where: { id: entry.listItem.id },
          data: { resolvedAt },
        });
      }

      return {
        ...createdPurchase,
        items: createdLines,
      };
    });

    return this.toPurchaseDetailDto(purchase);
  }

  async listPurchases(
    userId: string,
    kitchenId: string,
  ): Promise<PurchaseSummaryDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const purchases = await this.prisma.purchase.findMany({
      where: { kitchenId },
      include: {
        _count: { select: { items: true } },
        receiptMedia: true,
        items: {
          include: purchaseLineInclude,
          orderBy: { id: 'asc' },
          take: 4,
        },
      },
      orderBy: [{ purchasedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return Promise.all(
      purchases.map((purchase) => this.toPurchaseSummaryDto(purchase)),
    );
  }

  async getPurchase(
    userId: string,
    kitchenId: string,
    purchaseId: string,
  ): Promise<PurchaseDetailDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, kitchenId },
      include: {
        receiptMedia: true,
        items: { include: purchaseLineInclude },
      },
    });
    if (!purchase) {
      throw new BadRequestException('Nie znaleziono zakupu.');
    }
    return this.toPurchaseDetailDto(purchase);
  }

  private async findActiveShoppingListItem(
    kitchenId: string,
    itemId: string,
  ): Promise<ShoppingListItemWithProduct> {
    const item = await this.prisma.shoppingListItem.findFirst({
      where: {
        id: itemId,
        shoppingList: { kitchenId },
        resolvedAt: null,
      },
      include: shoppingItemInclude,
    });
    if (!item) {
      throw new BadRequestException('Nie znaleziono pozycji listy zakupów.');
    }
    return item;
  }

  private async toShoppingListItemProductDto(
    product: ProductWithImageMedia,
  ): Promise<ShoppingListItemProductDto> {
    return {
      id: product.id,
      name: product.name,
      defaultUnit: product.defaultUnit,
      purchaseMode: product.purchaseMode,
      ean: product.ean,
      imageUrl: product.imageUrl,
      image: await this.mediaService.buildImageSummary(
        product.imageMedia ?? null,
      ),
      category: product.category,
    };
  }

  private async toShoppingListItemDto(
    item: ShoppingListItemWithProduct,
  ): Promise<ShoppingListItemDto> {
    return {
      id: item.id,
      shoppingListId: item.shoppingListId,
      productId: item.productId,
      customName: item.customName,
      plannedQuantity:
        item.plannedQuantity !== null
          ? formatQuantity(item.plannedQuantity)
          : null,
      plannedUnit: item.plannedUnit,
      requiredQuantity:
        item.requiredQuantity !== null
          ? formatQuantity(item.requiredQuantity)
          : null,
      requiredUnit: item.requiredUnit,
      sourceRecipeId: item.sourceRecipeId,
      sourceRecipeName: item.sourceRecipeName,
      purchaseOptionId: item.purchaseOptionId,
      packageCount: item.packageCount,
      purchaseOption: item.purchaseOption
        ? toPurchaseOptionSummaryDto(item.purchaseOption)
        : null,
      note: item.note,
      status: item.status,
      resolvedAt: item.resolvedAt?.toISOString() ?? null,
      product: item.product
        ? await this.toShoppingListItemProductDto(item.product)
        : null,
    };
  }

  private async toPurchaseLineItemDto(
    line: PurchaseLineWithRelations,
  ): Promise<PurchaseLineItemDto> {
    return {
      id: line.id,
      productId: line.productId,
      productName: line.product.name,
      stockItemId: line.stockItemId,
      shoppingListItemId: line.shoppingListItemId,
      quantity: formatQuantity(line.quantity),
      unit: line.product.defaultUnit,
      priceMinor: line.priceMinor,
      location: line.location,
      expiresAt: line.expiresAt?.toISOString() ?? null,
      displayName: line.displayName,
      imageUrl: line.product.imageUrl,
      image: await this.mediaService.buildImageSummary(
        line.product.imageMedia ?? null,
      ),
    };
  }

  private async toPurchaseDetailDto(
    purchase: PurchaseWithLines,
  ): Promise<PurchaseDetailDto> {
    return {
      id: purchase.id,
      purchasedAt: purchase.purchasedAt.toISOString(),
      storeName: purchase.storeName,
      itemCount: purchase.items.length,
      totalPriceMinor: purchase.totalPriceMinor,
      currency: purchase.currency,
      createdAt: purchase.createdAt.toISOString(),
      lines: await Promise.all(
        purchase.items.map((line) => this.toPurchaseLineItemDto(line)),
      ),
      previewProducts: await this.toPreviewProducts(purchase.items),
      receiptImage: await this.mediaService.buildImageSummary(
        purchase.receiptMedia ?? null,
      ),
    };
  }

  private async toPurchaseSummaryDto(
    purchase: Purchase & {
      items: PurchaseLineWithRelations[];
      receiptMedia?: MediaAsset | null;
      _count: { items: number };
    },
  ): Promise<PurchaseSummaryDto> {
    return {
      id: purchase.id,
      purchasedAt: purchase.purchasedAt.toISOString(),
      storeName: purchase.storeName,
      itemCount: purchase._count.items,
      totalPriceMinor: purchase.totalPriceMinor,
      currency: purchase.currency,
      previewProducts: await this.toPreviewProducts(purchase.items),
      receiptImage: await this.mediaService.buildImageSummary(
        purchase.receiptMedia ?? null,
      ),
    };
  }

  private async toPreviewProducts(
    lines: PurchaseLineWithRelations[],
  ): Promise<PurchasePreviewProductDto[]> {
    const seen = new Set<string>();
    const preview: PurchasePreviewProductDto[] = [];
    for (const line of lines) {
      if (seen.has(line.productId)) {
        continue;
      }
      seen.add(line.productId);
      preview.push({
        productId: line.productId,
        name: line.displayName ?? line.product.name,
        imageUrl: line.product.imageUrl,
        image: await this.mediaService.buildImageSummary(
          line.product.imageMedia ?? null,
        ),
      });
      if (preview.length >= 4) {
        break;
      }
    }
    return preview;
  }
}

async function ensureShoppingList(
  tx: Prisma.TransactionClient,
  kitchenId: string,
): Promise<ShoppingList> {
  await tx.$executeRaw`
    INSERT INTO "ShoppingList" ("id", "kitchenId", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${kitchenId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("kitchenId") DO NOTHING
  `;
  return tx.shoppingList.findUniqueOrThrow({
    where: { kitchenId },
  });
}

async function touchShoppingListUpdatedAt(
  tx: Prisma.TransactionClient,
  shoppingListId: string,
): Promise<void> {
  await tx.shoppingList.update({
    where: { id: shoppingListId },
    data: { updatedAt: new Date() },
  });
}

function pendingProductConflictMessage(): string {
  return 'Aktywna pozycja pending dla tego produktu już istnieje.';
}

function isPendingProductUniqueViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes('shoppingListId') && target.includes('productId');
  }
  const constraint = error.meta?.constraint;
  return (
    typeof constraint === 'string' &&
    constraint.includes('ShoppingListItem_shoppingListId_productId_pending')
  );
}

async function findPendingProductItemForUpdate(
  tx: Prisma.TransactionClient,
  shoppingListId: string,
  productId: string,
): Promise<ShoppingListItemWithProduct | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "ShoppingListItem"
    WHERE "shoppingListId" = ${shoppingListId}
      AND "productId" = ${productId}
      AND "status" = 'pending'::"ShoppingListItemStatus"
      AND "resolvedAt" IS NULL
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return tx.shoppingListItem.findUnique({
    where: { id: row.id },
    include: shoppingItemInclude,
  });
}

function buildShoppingListItemCreateData(input: {
  shoppingListId: string;
  dto: CreateShoppingListItemDto;
  plannedQuantity: Prisma.Decimal | null;
  requiredQuantity: Prisma.Decimal | null;
  purchaseOptionId: string | null;
  packageCount: number | null;
}): Prisma.ShoppingListItemUncheckedCreateInput {
  return {
    shoppingListId: input.shoppingListId,
    productId: input.dto.productId ?? null,
    customName: normalizeOptionalCustomName(input.dto.customName),
    plannedQuantity: input.plannedQuantity,
    plannedUnit: input.dto.plannedUnit ?? null,
    requiredQuantity: input.requiredQuantity,
    requiredUnit: input.dto.requiredUnit ?? null,
    sourceRecipeId: input.dto.sourceRecipeId ?? null,
    sourceRecipeName: input.dto.sourceRecipeName ?? null,
    purchaseOptionId: input.purchaseOptionId,
    packageCount: input.packageCount,
    note: normalizeOptionalNote(input.dto.note),
  };
}

async function mergePendingProductItem(
  tx: Prisma.TransactionClient,
  shoppingList: ShoppingList,
  existing: ShoppingListItemWithProduct,
  dto: CreateShoppingListItemDto,
  plannedQuantity: Prisma.Decimal | null,
  requiredQuantity: Prisma.Decimal | null,
  purchaseOption: ProductPurchaseOption | null,
): Promise<ShoppingListItemWithProduct> {
  const mergedRequired = mergePlannedQuantities(
    existing.requiredQuantity,
    existing.requiredUnit,
    requiredQuantity,
    dto.requiredUnit,
  );

  const samePackageOption =
    dto.purchaseOptionId !== undefined &&
    existing.purchaseOptionId !== null &&
    dto.purchaseOptionId === existing.purchaseOptionId &&
    purchaseOption !== null &&
    dto.packageCount !== undefined;

  let plannedQuantityValue: Prisma.Decimal | null;
  let plannedUnitValue: ShoppingInputUnit | null;
  let packageCountValue: number | null | undefined;
  let purchaseOptionIdValue: string | null | undefined;

  if (samePackageOption) {
    packageCountValue = (existing.packageCount ?? 0) + dto.packageCount!;
    plannedQuantityValue =
      purchaseOption.contentQuantity.mul(packageCountValue);
    plannedUnitValue = productUnitToShoppingInputUnit(
      purchaseOption.contentUnit,
    );
    purchaseOptionIdValue = purchaseOption.id;
  } else {
    const mergedPlanned = mergePlannedQuantities(
      existing.plannedQuantity,
      existing.plannedUnit,
      plannedQuantity,
      dto.plannedUnit,
    );
    plannedQuantityValue = mergedPlanned.quantity;
    plannedUnitValue = mergedPlanned.unit;
    if (dto.purchaseOptionId !== undefined) {
      purchaseOptionIdValue = dto.purchaseOptionId;
      packageCountValue = dto.packageCount ?? null;
    }
  }

  const updated = await tx.shoppingListItem.update({
    where: { id: existing.id },
    data: {
      plannedQuantity: plannedQuantityValue,
      plannedUnit: plannedUnitValue,
      requiredQuantity: mergedRequired.quantity,
      requiredUnit: mergedRequired.unit,
      purchaseOptionId: purchaseOptionIdValue,
      packageCount: packageCountValue,
      sourceRecipeId:
        dto.sourceRecipeId !== undefined ? dto.sourceRecipeId : undefined,
      sourceRecipeName:
        dto.sourceRecipeName !== undefined ? dto.sourceRecipeName : undefined,
      note:
        dto.note !== undefined ? normalizeOptionalNote(dto.note) : undefined,
    },
    include: shoppingItemInclude,
  });
  await touchShoppingListUpdatedAt(tx, shoppingList.id);
  return updated;
}

async function createProductListItem(
  tx: Prisma.TransactionClient,
  shoppingList: ShoppingList,
  dto: CreateShoppingListItemDto,
  plannedQuantity: Prisma.Decimal | null,
  requiredQuantity: Prisma.Decimal | null,
  purchaseOption: ProductPurchaseOption | null,
): Promise<ShoppingListItemWithProduct> {
  const created = await tx.shoppingListItem.create({
    data: buildShoppingListItemCreateData({
      shoppingListId: shoppingList.id,
      dto,
      plannedQuantity,
      requiredQuantity,
      purchaseOptionId: purchaseOption?.id ?? dto.purchaseOptionId ?? null,
      packageCount: dto.packageCount ?? null,
    }),
    include: shoppingItemInclude,
  });
  await touchShoppingListUpdatedAt(tx, shoppingList.id);
  return created;
}

async function upsertPendingProductListItem(
  tx: Prisma.TransactionClient,
  shoppingList: ShoppingList,
  dto: CreateShoppingListItemDto,
  plannedQuantity: Prisma.Decimal | null,
  requiredQuantity: Prisma.Decimal | null,
  purchaseOption: ProductPurchaseOption | null,
): Promise<ShoppingListItemWithProduct> {
  const productId = dto.productId;
  if (!productId) {
    throw new BadRequestException('productId jest wymagane.');
  }

  const locked = await findPendingProductItemForUpdate(
    tx,
    shoppingList.id,
    productId,
  );
  if (locked) {
    if (!dto.mergeQuantity) {
      throw new ConflictException(pendingProductConflictMessage());
    }
    return mergePendingProductItem(
      tx,
      shoppingList,
      locked,
      dto,
      plannedQuantity,
      requiredQuantity,
      purchaseOption,
    );
  }

  try {
    await tx.$executeRaw`SAVEPOINT create_pending_product_item`;
    const created = await createProductListItem(
      tx,
      shoppingList,
      dto,
      plannedQuantity,
      requiredQuantity,
      purchaseOption,
    );
    await tx.$executeRaw`RELEASE SAVEPOINT create_pending_product_item`;
    return created;
  } catch (error) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT create_pending_product_item`;
    if (!isPendingProductUniqueViolation(error)) {
      throw error;
    }
    if (!dto.mergeQuantity) {
      throw new ConflictException(pendingProductConflictMessage());
    }
    const existing = await findPendingProductItemForUpdate(
      tx,
      shoppingList.id,
      productId,
    );
    if (!existing) {
      throw new ConflictException(pendingProductConflictMessage());
    }
    return mergePendingProductItem(
      tx,
      shoppingList,
      existing,
      dto,
      plannedQuantity,
      requiredQuantity,
      purchaseOption,
    );
  }
}

function validateCreateShoppingListItem(dto: CreateShoppingListItemDto): void {
  if (!dto.productId && !dto.customName?.trim()) {
    throw new BadRequestException(
      'customName jest wymagane, gdy nie podano productId.',
    );
  }
}

function assertNotResolved(item: ShoppingListItem): void {
  if (item.resolvedAt !== null) {
    throw new BadRequestException('Pozycja została już rozliczona.');
  }
}

function normalizeOptionalCustomName(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalNote(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalStoreName(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function assertInputUnitCompatibleWithProduct(
  inputUnit: ShoppingInputUnit,
  productUnit: ProductUnit,
): void {
  const inputBase = INPUT_UNIT_BASE[inputUnit].base;
  const productBase = PRODUCT_UNIT_BASE[productUnit];
  if (inputBase !== productBase) {
    throw new BadRequestException('Jednostka nie pasuje do produktu.');
  }
}

function convertQuantityToProductUnit(
  quantity: Prisma.Decimal,
  inputUnit: ShoppingInputUnit,
  productUnit: ProductUnit,
): Prisma.Decimal {
  assertInputUnitCompatibleWithProduct(inputUnit, productUnit);
  return quantity.mul(INPUT_UNIT_BASE[inputUnit].factor);
}

function convertToBaseQuantity(
  quantity: Prisma.Decimal,
  unit: ShoppingInputUnit,
): Prisma.Decimal {
  return quantity.mul(INPUT_UNIT_BASE[unit].factor);
}

function convertFromBaseQuantity(
  quantity: Prisma.Decimal,
  unit: ShoppingInputUnit,
): Prisma.Decimal {
  return quantity.div(INPUT_UNIT_BASE[unit].factor);
}

function mergePlannedQuantities(
  existingQuantity: Prisma.Decimal | null,
  existingUnit: ShoppingInputUnit | null,
  incomingQuantity: Prisma.Decimal | null,
  incomingUnit: ShoppingInputUnit | undefined,
): { quantity: Prisma.Decimal | null; unit: ShoppingInputUnit | null } {
  if (incomingQuantity === null || incomingUnit === undefined) {
    return { quantity: existingQuantity, unit: existingUnit };
  }
  if (existingQuantity === null || existingUnit === null) {
    return { quantity: incomingQuantity, unit: incomingUnit };
  }
  assertCompatibleInputUnits(existingUnit, incomingUnit);
  const mergedBase = convertToBaseQuantity(existingQuantity, existingUnit).add(
    convertToBaseQuantity(incomingQuantity, incomingUnit),
  );
  return {
    quantity: convertFromBaseQuantity(mergedBase, existingUnit),
    unit: existingUnit,
  };
}

function assertCompatibleInputUnits(
  left: ShoppingInputUnit,
  right: ShoppingInputUnit,
): void {
  if (INPUT_UNIT_BASE[left].base !== INPUT_UNIT_BASE[right].base) {
    throw new BadRequestException(
      'Nie można sumować ilości w niezgodnych jednostkach.',
    );
  }
}

function assertProductPurchaseModeForCreate(
  product: Product,
  dto: CreateShoppingListItemDto,
): void {
  switch (product.purchaseMode) {
    case ProductPurchaseMode.unconfigured:
      throw new BadRequestException(PRODUCT_PURCHASE_CONFIG_REQUIRED_MESSAGE);
    case ProductPurchaseMode.packaged: {
      if (!dto.purchaseOptionId || !dto.packageCount) {
        throw new BadRequestException(
          'Produkt w trybie opakowań wymaga purchaseOptionId i packageCount.',
        );
      }
      return;
    }
    case ProductPurchaseMode.exact: {
      if (dto.purchaseOptionId || dto.packageCount) {
        throw new BadRequestException(
          'Produkt w trybie dokładnej ilości nie używa opakowań.',
        );
      }
      if (
        dto.plannedQuantity === undefined ||
        dto.plannedUnit === undefined ||
        parseQuantityString(dto.plannedQuantity, 'plannedQuantity').lte(0)
      ) {
        throw new BadRequestException(
          'Produkt w trybie dokładnej ilości wymaga plannedQuantity i plannedUnit.',
        );
      }
      return;
    }
    default: {
      const exhaustive: never = product.purchaseMode;
      return exhaustive;
    }
  }
}

function assertProductPurchaseModeForCheckout(
  product: Product,
  listItem: ShoppingListItemWithProduct,
): void {
  switch (product.purchaseMode) {
    case ProductPurchaseMode.unconfigured:
      throw new BadRequestException(PRODUCT_PURCHASE_CONFIG_REQUIRED_MESSAGE);
    case ProductPurchaseMode.packaged: {
      if (
        !listItem.purchaseOptionId ||
        listItem.packageCount === null ||
        listItem.packageCount < 1 ||
        !listItem.purchaseOption
      ) {
        throw new BadRequestException(
          'Checkout opakowań wymaga aktywnej opcji zakupu i packageCount na pozycji listy.',
        );
      }
      return;
    }
    case ProductPurchaseMode.exact: {
      if (listItem.purchaseOptionId || listItem.packageCount) {
        throw new BadRequestException(
          'Produkt w trybie dokładnej ilości nie może być rozliczany jako opakowanie.',
        );
      }
      return;
    }
    default: {
      const exhaustive: never = product.purchaseMode;
      return exhaustive;
    }
  }
}

function resolveCheckoutStockQuantity(
  line: CheckoutPurchaseLineDto,
  listItem: ShoppingListItemWithProduct,
  product: Product,
): Prisma.Decimal {
  if (product.purchaseMode === ProductPurchaseMode.packaged) {
    if (
      !listItem.purchaseOption ||
      listItem.packageCount === null ||
      listItem.packageCount < 1
    ) {
      throw new BadRequestException(
        'Checkout opakowań wymaga packageCount i opcji zakupu.',
      );
    }
    return listItem.purchaseOption.contentQuantity.mul(listItem.packageCount);
  }
  return convertQuantityToProductUnit(
    parseQuantityString(line.quantity, 'quantity'),
    line.inputUnit,
    product.defaultUnit,
  );
}

async function resolveCheckoutProduct(
  tx: Prisma.TransactionClient,
  kitchenId: string,
  line: CheckoutPurchaseLineDto,
  listItem: ShoppingListItemWithProduct,
): Promise<Product> {
  const productId = line.productId ?? listItem.productId;
  if (productId) {
    const product = await tx.product.findFirst({
      where: { id: productId, kitchenId },
    });
    if (!product) {
      throw new BadRequestException('Nie znaleziono produktu w tej kuchni.');
    }
    assertInputUnitCompatibleWithProduct(line.inputUnit, product.defaultUnit);
    return product;
  }

  if (!line.createProduct) {
    throw new BadRequestException(
      'Brak produktu — podaj productId albo createProduct.',
    );
  }

  const name = line.createProduct.name.trim();
  const normalizedName = normalizeProductName(name);
  if (!normalizedName) {
    throw new BadRequestException('Nazwa produktu jest wymagana.');
  }
  assertInputUnitCompatibleWithProduct(
    line.inputUnit,
    line.createProduct.defaultUnit,
  );

  try {
    return await tx.product.create({
      data: {
        kitchenId,
        name,
        normalizedName,
        defaultUnit: line.createProduct.defaultUnit,
        purchaseMode: ProductPurchaseMode.exact,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Produkt o tej nazwie już istnieje w kuchni.',
      );
    }
    throw error;
  }
}

function toPurchaseOptionSummaryDto(
  option: ProductPurchaseOption,
): PurchaseOptionSummaryDto {
  return {
    id: option.id,
    name: option.name,
    contentQuantity: formatQuantity(option.contentQuantity),
    contentUnit: option.contentUnit,
  };
}
