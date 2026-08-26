import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  ProductUnit,
  ShoppingInputUnit,
  ShoppingListItemStatus,
  type Product,
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
import { PrismaService } from '../prisma/prisma.service';
import {
  CheckoutPurchaseDto,
  CheckoutPurchaseLineDto,
  PurchaseDetailDto,
  PurchaseLineItemDto,
  PurchaseSummaryDto,
} from './dto/purchase.dto';
import {
  CreateShoppingListItemDto,
  ShoppingListItemDto,
  ShoppingListItemProductDto,
  UpdateShoppingListItemDto,
} from './dto/shopping-list-item.dto';

type ShoppingListItemWithProduct = ShoppingListItem & {
  product: Product | null;
};

type PurchaseLineWithRelations = PurchaseLineItem & {
  product: Product;
};

type PurchaseWithLines = Purchase & {
  items: PurchaseLineWithRelations[];
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
  constructor(private readonly prisma: PrismaService) {}

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
      include: { product: true },
      orderBy: [{ status: 'asc' }, { id: 'asc' }],
    });
    return items.map(toShoppingListItemDto);
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

    if (
      (plannedQuantity !== null && dto.plannedUnit === undefined) ||
      (plannedQuantity === null && dto.plannedUnit !== undefined)
    ) {
      throw new BadRequestException(
        'plannedQuantity i plannedUnit muszą być podane razem.',
      );
    }

    if (dto.productId) {
      const product = await tx.product.findFirst({
        where: { id: dto.productId, kitchenId },
      });
      if (!product) {
        throw new BadRequestException('Nie znaleziono produktu w tej kuchni.');
      }
      if (dto.plannedUnit) {
        assertInputUnitCompatibleWithProduct(
          dto.plannedUnit,
          product.defaultUnit,
        );
      }
    }

    const shoppingList = await ensureShoppingList(tx, kitchenId);

    if (dto.productId) {
      const item = await upsertPendingProductListItem(
        tx,
        shoppingList,
        dto,
        plannedQuantity,
      );
      return toShoppingListItemDto(item);
    }

    const created = await tx.shoppingListItem.create({
      data: {
        shoppingListId: shoppingList.id,
        productId: null,
        customName: dto.customName?.trim() ?? null,
        plannedQuantity,
        plannedUnit: dto.plannedUnit ?? null,
        note: normalizeOptionalNote(dto.note),
      },
      include: { product: true },
    });
    await touchShoppingListUpdatedAt(tx, shoppingList.id);
    return toShoppingListItemDto(created);
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

    const plannedQuantity =
      dto.plannedQuantity !== undefined
        ? parseQuantityString(dto.plannedQuantity, 'plannedQuantity')
        : undefined;

    if (
      (plannedQuantity !== undefined && dto.plannedUnit === undefined) ||
      (plannedQuantity === undefined && dto.plannedUnit !== undefined)
    ) {
      throw new BadRequestException(
        'plannedQuantity i plannedUnit muszą być podane razem.',
      );
    }

    const plannedUnit = dto.plannedUnit ?? existing.plannedUnit;
    if (plannedUnit && existing.product) {
      assertInputUnitCompatibleWithProduct(
        plannedUnit,
        existing.product.defaultUnit,
      );
    }

    const item = await this.prisma.shoppingListItem.update({
      where: { id: existing.id },
      data: {
        customName:
          dto.customName !== undefined ? dto.customName.trim() : undefined,
        plannedQuantity,
        plannedUnit: dto.plannedUnit,
        note:
          dto.note === undefined ? undefined : normalizeOptionalNote(dto.note),
      },
      include: { product: true },
    });
    return toShoppingListItemDto(item);
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
      include: { product: true },
    });
    return toShoppingListItemDto(item);
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
        items: { include: { product: true } },
      },
    });
    if (existing) {
      if (existing.kitchenId !== kitchenId) {
        throw new ConflictException('Klucz idempotencji jest już użyty.');
      }
      return toPurchaseDetailDto(existing);
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
        include: { product: true },
      });
      const listItemById = new Map(listItems.map((item) => [item.id, item]));

      let totalPriceMinor = 0;
      const resolvedAt = new Date();
      const lineCreates: Array<{
        line: CheckoutPurchaseLineDto;
        listItem: ShoppingListItemWithProduct;
        product: Product;
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
        const stockQuantity = convertQuantityToProductUnit(
          parseQuantityString(line.quantity, 'quantity'),
          line.inputUnit,
          product.defaultUnit,
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
          include: { product: true },
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

    return toPurchaseDetailDto(purchase);
  }

  async listPurchases(
    userId: string,
    kitchenId: string,
  ): Promise<PurchaseSummaryDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const purchases = await this.prisma.purchase.findMany({
      where: { kitchenId },
      include: { _count: { select: { items: true } } },
      orderBy: [{ purchasedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return purchases.map((purchase) => ({
      id: purchase.id,
      purchasedAt: purchase.purchasedAt.toISOString(),
      storeName: purchase.storeName,
      itemCount: purchase._count.items,
      totalPriceMinor: purchase.totalPriceMinor,
      currency: purchase.currency,
    }));
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
        items: { include: { product: true } },
      },
    });
    if (!purchase) {
      throw new BadRequestException('Nie znaleziono zakupu.');
    }
    return toPurchaseDetailDto(purchase);
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
      include: { product: true },
    });
    if (!item) {
      throw new BadRequestException('Nie znaleziono pozycji listy zakupów.');
    }
    return item;
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
    include: { product: true },
  });
}

async function mergePendingProductItem(
  tx: Prisma.TransactionClient,
  shoppingList: ShoppingList,
  existing: ShoppingListItemWithProduct,
  dto: CreateShoppingListItemDto,
  plannedQuantity: Prisma.Decimal | null,
): Promise<ShoppingListItemWithProduct> {
  const mergedQuantity = mergePlannedQuantities(
    existing.plannedQuantity,
    existing.plannedUnit,
    plannedQuantity,
    dto.plannedUnit,
  );
  const updated = await tx.shoppingListItem.update({
    where: { id: existing.id },
    data: {
      plannedQuantity: mergedQuantity.quantity,
      plannedUnit: mergedQuantity.unit,
      note:
        dto.note !== undefined ? normalizeOptionalNote(dto.note) : undefined,
    },
    include: { product: true },
  });
  await touchShoppingListUpdatedAt(tx, shoppingList.id);
  return updated;
}

async function createProductListItem(
  tx: Prisma.TransactionClient,
  shoppingList: ShoppingList,
  dto: CreateShoppingListItemDto,
  plannedQuantity: Prisma.Decimal | null,
): Promise<ShoppingListItemWithProduct> {
  const created = await tx.shoppingListItem.create({
    data: {
      shoppingListId: shoppingList.id,
      productId: dto.productId ?? null,
      customName: normalizeOptionalCustomName(dto.customName),
      plannedQuantity,
      plannedUnit: dto.plannedUnit ?? null,
      note: normalizeOptionalNote(dto.note),
    },
    include: { product: true },
  });
  await touchShoppingListUpdatedAt(tx, shoppingList.id);
  return created;
}

async function upsertPendingProductListItem(
  tx: Prisma.TransactionClient,
  shoppingList: ShoppingList,
  dto: CreateShoppingListItemDto,
  plannedQuantity: Prisma.Decimal | null,
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
    );
  }

  try {
    await tx.$executeRaw`SAVEPOINT create_pending_product_item`;
    const created = await createProductListItem(
      tx,
      shoppingList,
      dto,
      plannedQuantity,
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

function toShoppingListItemProductDto(
  product: Product,
): ShoppingListItemProductDto {
  return {
    id: product.id,
    name: product.name,
    defaultUnit: product.defaultUnit,
    ean: product.ean,
    imageUrl: product.imageUrl,
    category: product.category,
  };
}

function toShoppingListItemDto(
  item: ShoppingListItemWithProduct,
): ShoppingListItemDto {
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
    note: item.note,
    status: item.status,
    resolvedAt: item.resolvedAt?.toISOString() ?? null,
    product: item.product ? toShoppingListItemProductDto(item.product) : null,
  };
}

function toPurchaseLineItemDto(
  line: PurchaseLineWithRelations,
): PurchaseLineItemDto {
  return {
    id: line.id,
    productId: line.productId,
    productName: line.product.name,
    stockItemId: line.stockItemId,
    shoppingListItemId: line.shoppingListItemId,
    quantity: formatQuantity(line.quantity),
    priceMinor: line.priceMinor,
    location: line.location,
    expiresAt: line.expiresAt?.toISOString() ?? null,
    displayName: line.displayName,
  };
}

function toPurchaseDetailDto(purchase: PurchaseWithLines): PurchaseDetailDto {
  return {
    id: purchase.id,
    purchasedAt: purchase.purchasedAt.toISOString(),
    storeName: purchase.storeName,
    itemCount: purchase.items.length,
    totalPriceMinor: purchase.totalPriceMinor,
    currency: purchase.currency,
    createdAt: purchase.createdAt.toISOString(),
    lines: purchase.items.map(toPurchaseLineItemDto),
  };
}
