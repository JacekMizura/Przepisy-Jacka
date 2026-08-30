import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  MediaPurpose,
  MediaUploadStatus,
  NutritionDataSource,
  PackageContentUnit,
  ProductPurchaseMode,
  ProductUnit,
  ShoppingListItemStatus,
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
import { MediaService } from '../media/media.service';
import {
  CreateProductIntakeDto,
  ProductIntakeResultDto,
  ProductMatchResultDto,
} from './dto/product-intake.dto';
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
  ProductRemovalPreviewDto,
  ProductUndoAdditionResultDto,
} from './dto/product-removal.dto';
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
import type {
  ExpiryStatusFilter,
  StockSort,
  StockSummaryPageDto,
} from './dto/stock-list-query.dto';
import {
  allocateConsumption,
  stockItemDeleteBlockReason,
  unitPriceMinor,
  type StockBatchRow,
} from './stock-consume';
import { resolveStockConsumptionKindAndReason } from './stock-consumption-kind';
import {
  packageCountToStockQuantity,
  convertPackageContentToProductUnit,
} from './package-quantity';
import {
  buildStockListEntries,
  matchesExpiryStatus,
  paginateStockListEntries,
  sortStockListEntries,
  type StockListProductAggregate,
} from './stock-list';
import { parsePositivePackageCount } from './package-price';
import { buildProductMatchMessage } from './product-match-message';
import { ProductGroupService } from './product-group.service';
import {
  applyOptionalPackageFieldUpdates,
  parsePackageFields,
} from './product-package-fields';
import {
  assertPackageCountAllowedForProduct,
  resolveNewProductPurchase,
} from './purchase-mode';
import {
  canUndoProductAddition,
  resolveProductRemovalMode,
  type ProductRemovalFacts,
} from './product-removal';
import {
  toProductDto,
  toProductNutritionDto,
  type ProductWithRelations,
} from './product-mapper';

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
  group: { select: { id: true, name: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly productGroupService: ProductGroupService,
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
    const packageFields = parsePackageFields(dto);
    if (dto.groupId) {
      await this.productGroupService.assertGroupInKitchen(
        this.prisma,
        kitchenId,
        dto.groupId,
      );
    }

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
          groupId: dto.groupId ?? null,
          brand: packageFields.brand,
          variantLabel: packageFields.variantLabel,
          packageQuantity: packageFields.packageQuantity,
          packageUnit: packageFields.packageUnit,
        },
        include: productInclude,
      });
      return this.toProductDtoWithMedia(product);
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

    const data: Prisma.ProductUpdateInput = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const normalizedName = normalizeProductName(name);
      if (!normalizedName) {
        throw new BadRequestException('Nazwa produktu jest wymagana.');
      }
      const archivedByName = await this.prisma.product.findFirst({
        where: {
          kitchenId,
          normalizedName,
          archivedAt: { not: null },
          id: { not: product.id },
        },
        select: { id: true },
      });
      if (archivedByName) {
        throw archivedProductNameConflict(archivedByName.id);
      }
      data.name = name;
      data.normalizedName = normalizedName;
    }

    if (dto.defaultUnit !== undefined) {
      data.defaultUnit = dto.defaultUnit;
    }

    if (dto.ean !== undefined) {
      const ean = normalizeOptionalEan(dto.ean);
      if (ean) {
        const archivedByEan = await this.prisma.product.findFirst({
          where: {
            kitchenId,
            ean,
            archivedAt: { not: null },
            id: { not: product.id },
          },
          select: { id: true },
        });
        if (archivedByEan) {
          throw archivedProductNameConflict(archivedByEan.id);
        }
      }
      data.ean = ean;
    }

    if (dto.category !== undefined) {
      data.category = normalizeOptionalCategory(dto.category);
    }

    applyOptionalPackageFieldUpdates(data, dto);

    if (dto.purchaseMode !== undefined) {
      if (dto.purchaseMode === ProductPurchaseMode.packaged) {
        const nextProduct = {
          ...product,
          packageQuantity:
            (data.packageQuantity as Prisma.Decimal | null | undefined) ??
            product.packageQuantity,
          packageUnit:
            (data.packageUnit as PackageContentUnit | null | undefined) ??
            product.packageUnit,
        };
        await ensureDefaultPurchaseOptionFromProductPackage(
          this.prisma,
          nextProduct,
        );
        await assertPackagedProductHasValidActiveOptions(
          this.prisma,
          product.id,
        );
      }
      if (dto.purchaseMode === ProductPurchaseMode.exact) {
        data.packageQuantity = null;
        data.packageUnit = null;
      }
      data.purchaseMode = dto.purchaseMode;
    }

    if (dto.groupId !== undefined) {
      if (dto.groupId !== null) {
        await this.productGroupService.assertGroupInKitchen(
          this.prisma,
          kitchenId,
          dto.groupId,
        );
      }
      data.group =
        dto.groupId === null
          ? { disconnect: true }
          : { connect: { id: dto.groupId } };
    }

    if (Object.keys(data).length === 0) {
      const current = await this.prisma.product.findFirstOrThrow({
        where: { id: product.id },
        include: productInclude,
      });
      return this.toProductDtoWithMedia(current);
    }

    try {
      const updated = await this.prisma.product.update({
        where: { id: product.id },
        data,
        include: productInclude,
      });
      return this.toProductDtoWithMedia(updated);
    } catch (error) {
      throw toProductWriteError(error);
    }
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
    const data = await buildProductNutritionWriteData(
      this.prisma,
      product,
      dto,
    );
    const nutrition = await this.prisma.productNutrition.upsert({
      where: { productId: product.id },
      create: { productId: product.id, ...data },
      update: data,
    });
    return toProductNutritionDto(nutrition);
  }

  async deleteProductNutrition(
    userId: string,
    kitchenId: string,
    productId: string,
  ): Promise<{ deleted: true }> {
    const product = await this.findKitchenProduct(userId, kitchenId, productId);
    await this.prisma.productNutrition.deleteMany({
      where: { productId: product.id },
    });
    return { deleted: true };
  }

  async matchProducts(
    userId: string,
    kitchenId: string,
    query: { ean?: string; name?: string },
  ): Promise<ProductMatchResultDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);

    const ean = normalizeOptionalEan(query.ean);
    const nameQuery = query.name?.trim() ?? '';
    const normalizedQuery = nameQuery ? normalizeProductName(nameQuery) : '';

    let exactEan: ProductDto | null = null;
    if (ean) {
      const product = await this.prisma.product.findFirst({
        where: { kitchenId, ean, archivedAt: null },
        include: productInclude,
      });
      if (product) {
        exactEan = await this.toProductDtoWithMedia(product);
      }
    }

    let exactName: ProductDto | null = null;
    if (normalizedQuery) {
      const product = await this.prisma.product.findFirst({
        where: { kitchenId, normalizedName: normalizedQuery, archivedAt: null },
        include: productInclude,
      });
      if (product) {
        exactName = await this.toProductDtoWithMedia(product);
      }
    }

    let archivedMatch: ProductDto | null = null;
    if (ean) {
      const byEan = await this.prisma.product.findFirst({
        where: { kitchenId, ean, archivedAt: { not: null } },
        include: productInclude,
      });
      if (byEan) {
        archivedMatch = await this.toProductDtoWithMedia(byEan);
      }
    }
    if (!archivedMatch && normalizedQuery) {
      const byName = await this.prisma.product.findFirst({
        where: {
          kitchenId,
          normalizedName: normalizedQuery,
          archivedAt: { not: null },
        },
        include: productInclude,
      });
      if (byName) {
        archivedMatch = await this.toProductDtoWithMedia(byName);
      }
    }

    const nameSuggestions: ProductDto[] = [];
    if (normalizedQuery) {
      const exactId = exactName?.id;
      const candidates = await this.prisma.product.findMany({
        where: {
          kitchenId,
          archivedAt: null,
          ...(exactId ? { id: { not: exactId } } : {}),
        },
        include: productInclude,
        orderBy: [{ name: 'asc' }],
        take: 50,
      });
      for (const candidate of candidates) {
        const candidateName = candidate.normalizedName;
        if (
          candidateName.includes(normalizedQuery) ||
          normalizedQuery.includes(candidateName)
        ) {
          nameSuggestions.push(await this.toProductDtoWithMedia(candidate));
          if (nameSuggestions.length >= 5) {
            break;
          }
        }
      }
    }

    const suggestedGroups = nameQuery
      ? await this.productGroupService.suggestGroupsByName(kitchenId, nameQuery)
      : [];

    return {
      exactEan,
      exactName,
      archivedMatch,
      nameSuggestions,
      suggestedGroups,
      message: buildProductMatchMessage({
        exactEan,
        exactName,
        archivedMatch,
      }),
    };
  }

  async createProductIntake(
    userId: string,
    kitchenId: string,
    dto: CreateProductIntakeDto,
  ): Promise<ProductIntakeResultDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);

    const hasNew = dto.newProduct !== undefined;
    const hasExisting = dto.existingProductId !== undefined;
    if (hasNew === hasExisting) {
      throw new BadRequestException(
        'Podaj dokładnie jedno z: newProduct albo existingProductId.',
      );
    }

    const existingIdempotency =
      await this.prisma.productIntakeIdempotency.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
    if (existingIdempotency) {
      if (existingIdempotency.kitchenId !== kitchenId) {
        throw new ConflictException('Klucz idempotencji jest już użyty.');
      }
      return this.withRemovalHint(
        kitchenId,
        replayIntakeResult(existingIdempotency.resultJson),
      );
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const raced = await tx.productIntakeIdempotency.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (raced) {
          if (raced.kitchenId !== kitchenId) {
            throw new ConflictException('Klucz idempotencji jest już użyty.');
          }
          return replayIntakeResult(raced.resultJson);
        }

        let product: Product;
        let restoredFromArchive = false;

        if (dto.existingProductId) {
          const existing = await tx.product.findFirst({
            where: { id: dto.existingProductId, kitchenId },
          });
          if (!existing) {
            throw new BadRequestException(
              'Nie znaleziono produktu w tej kuchni.',
            );
          }
          if (existing.archivedAt !== null) {
            if (!dto.restoreArchived) {
              throw archivedProductNameConflict(existing.id);
            }
            product = await tx.product.update({
              where: { id: existing.id },
              data: { archivedAt: null },
            });
            restoredFromArchive = true;
          } else {
            product = existing;
          }
          assertProductNotArchived(product);
        } else {
          const newProduct = dto.newProduct!;
          const name = newProduct.name.trim();
          const normalizedName = normalizeProductName(name);
          if (!normalizedName) {
            throw new BadRequestException('Nazwa produktu jest wymagana.');
          }
          const ean = normalizeOptionalEan(newProduct.ean);
          const category = normalizeOptionalCategory(newProduct.category);
          const packageFields = parsePackageFields(newProduct);
          const purchase = resolveNewProductPurchase({
            requestedMode: newProduct.purchaseMode,
            packageFields,
          });

          const hasGroupId =
            newProduct.groupId !== undefined &&
            newProduct.groupId !== null &&
            newProduct.groupId !== '';
          const createGroupName = newProduct.createGroupName?.trim() ?? '';
          if (hasGroupId && createGroupName) {
            throw new BadRequestException(
              'Podaj groupId albo createGroupName — nie oba naraz.',
            );
          }

          let groupId: string | null = null;
          if (hasGroupId) {
            await this.productGroupService.assertGroupInKitchen(
              tx,
              kitchenId,
              newProduct.groupId!,
            );
            groupId = newProduct.groupId!;
          } else if (createGroupName) {
            const createdGroup =
              await this.productGroupService.createGroupInClient(
                tx,
                kitchenId,
                createGroupName,
              );
            groupId = createdGroup.id;
          }

          const archivedByName = await tx.product.findFirst({
            where: { kitchenId, normalizedName, archivedAt: { not: null } },
            select: { id: true },
          });
          if (archivedByName) {
            throw archivedProductNameConflict(archivedByName.id);
          }
          if (ean) {
            const archivedByEan = await tx.product.findFirst({
              where: { kitchenId, ean, archivedAt: { not: null } },
              select: { id: true },
            });
            if (archivedByEan) {
              throw archivedProductNameConflict(archivedByEan.id);
            }
          }

          product = await tx.product.create({
            data: {
              kitchenId,
              name,
              normalizedName,
              defaultUnit: newProduct.defaultUnit,
              ean,
              category,
              groupId,
              brand: packageFields.brand,
              variantLabel: packageFields.variantLabel,
              packageQuantity: purchase.packageQuantity,
              packageUnit: purchase.packageUnit,
              purchaseMode: purchase.purchaseMode,
            },
          });

          if (purchase.purchaseMode === ProductPurchaseMode.packaged) {
            await ensureDefaultPurchaseOptionFromProductPackage(tx, product);
          }

          if (
            newProduct.imageMediaId !== undefined &&
            newProduct.imageMediaId !== null &&
            newProduct.imageMediaId !== ''
          ) {
            const asset = await tx.mediaAsset.findFirst({
              where: {
                id: newProduct.imageMediaId,
                kitchenId,
                purpose: MediaPurpose.product,
                status: MediaUploadStatus.ready,
              },
            });
            if (!asset) {
              throw new BadRequestException(
                'Zdjęcie produktu musi należeć do tej kuchni, mieć purpose=product i status ready.',
              );
            }
            product = await tx.product.update({
              where: { id: product.id },
              data: { imageMediaId: asset.id },
            });
          }
        }

        if (dto.nutrition) {
          const nutritionData = await buildProductNutritionWriteData(
            tx,
            product,
            dto.nutrition,
          );
          await tx.productNutrition.upsert({
            where: { productId: product.id },
            create: { productId: product.id, ...nutritionData },
            update: nutritionData,
          });
        }

        let stockItem: StockItem | null = null;
        if (dto.stock) {
          const quantity = resolveIntakeStockQuantity(product, dto.stock);
          assertStockQuantities(quantity, quantity);
          const priceMinor =
            dto.stock.purchasePriceMinor === undefined
              ? null
              : dto.stock.purchasePriceMinor;
          if (priceMinor !== null && priceMinor < 0) {
            throw new BadRequestException('Cena nie może być ujemna.');
          }
          const storeName =
            dto.stock.storeName === undefined
              ? null
              : dto.stock.storeName?.trim() || null;
          const purchasedAt = dto.stock.purchasedAt
            ? new Date(dto.stock.purchasedAt)
            : new Date();
          const expiresAt =
            dto.stock.expiresAt === undefined || dto.stock.expiresAt === null
              ? null
              : new Date(dto.stock.expiresAt);

          stockItem = await tx.stockItem.create({
            data: {
              productId: product.id,
              initialQuantity: quantity,
              quantity,
              location: dto.stock.location,
              purchasePriceMinor: priceMinor,
              storeName,
              purchasedAt,
              expiresAt,
              currency: 'PLN',
              ...resolvePackageSnapshot(product, dto.stock),
            },
          });
        }

        const productWithRelations = await tx.product.findFirstOrThrow({
          where: { id: product.id },
          include: productInclude,
        });
        const productDto =
          await this.toProductDtoWithMedia(productWithRelations);
        const result = {
          product: productDto,
          stockItem: stockItem ? toStockItemDto(stockItem) : null,
          replayed: false,
          restoredFromArchive,
        };

        await tx.productIntakeIdempotency.create({
          data: {
            kitchenId,
            idempotencyKey: dto.idempotencyKey,
            resultJson: result as unknown as Prisma.InputJsonValue,
          },
        });

        return result;
      });
      return this.withRemovalHint(kitchenId, created);
    } catch (error) {
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
        if (target.includes('idempotencyKey')) {
          const stored = await this.prisma.productIntakeIdempotency.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
          });
          if (stored) {
            if (stored.kitchenId !== kitchenId) {
              throw new ConflictException('Klucz idempotencji jest już użyty.');
            }
            return this.withRemovalHint(
              kitchenId,
              replayIntakeResult(stored.resultJson),
            );
          }
        }
      }
      throw toProductWriteError(error);
    }
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
        data: {
          purchaseMode: ProductPurchaseMode.exact,
          packageQuantity: null,
          packageUnit: null,
        },
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

  async getProductRemovalPreview(
    userId: string,
    kitchenId: string,
    productId: string,
  ): Promise<ProductRemovalPreviewDto> {
    const facts = await this.loadProductRemovalFacts(
      userId,
      kitchenId,
      productId,
    );
    return resolveProductRemovalMode(facts);
  }

  async undoProductAddition(
    userId: string,
    kitchenId: string,
    productId: string,
  ): Promise<ProductUndoAdditionResultDto> {
    const facts = await this.loadProductRemovalFacts(
      userId,
      kitchenId,
      productId,
    );
    const preview = resolveProductRemovalMode(facts);
    if (preview.mode !== 'undo') {
      throw new ConflictException(
        preview.reason ??
          'Nie można cofnąć dodania tego produktu. Użyj archiwizacji.',
      );
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, kitchenId },
      select: { id: true, imageMediaId: true },
    });
    if (!product) {
      throw new BadRequestException('Nie znaleziono produktu.');
    }

    if (product.imageMediaId) {
      try {
        await this.mediaService.detachProductImage(
          userId,
          kitchenId,
          product.id,
        );
      } catch {
        // Nie blokuj undo, gdy usuwanie mediów się nie uda — odłączymy FK w transakcji.
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const stockItems = await tx.stockItem.findMany({
          where: { productId: product.id },
          include: {
            purchaseLineItem: { select: { id: true } },
            _count: { select: { consumptionLines: true } },
          },
        });
        for (const item of stockItems) {
          if (
            item.purchaseLineItem !== null ||
            item._count.consumptionLines > 0
          ) {
            throw new ConflictException(
              'Nie można cofnąć dodania: partia ma powiązanie z zakupem lub historią zużycia.',
            );
          }
        }

        if (stockItems.length > 0) {
          await tx.stockItem.deleteMany({
            where: { id: { in: stockItems.map((item) => item.id) } },
          });
        }

        await tx.productNutrition.deleteMany({
          where: { productId: product.id },
        });

        await tx.product.update({
          where: { id: product.id },
          data: { imageMediaId: null },
        });

        try {
          await tx.productIntakeIdempotency.deleteMany({
            where: {
              kitchenId,
              resultJson: {
                path: ['product', 'id'],
                equals: product.id,
              },
            },
          });
        } catch {
          // Best-effort: brak wsparcia filtra JSON nie blokuje undo.
        }

        await tx.product.delete({ where: { id: product.id } });
      });
    } catch (error) {
      throw toProductWriteError(error);
    }

    return { undone: true };
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
            storeName:
              dto.storeName === undefined
                ? null
                : dto.storeName?.trim() || null,
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
    filters: {
      location?: StorageLocation;
      place?: StorageLocation;
      productId?: string;
      search?: string;
      category?: string;
      unit?: ProductUnit;
      expiryStatus?: ExpiryStatusFilter;
      archived?: 'active' | 'archived' | 'all';
      sort?: StockSort;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<StockSummaryPageDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const now = new Date();
    const place = filters.place ?? filters.location;
    const search = filters.search?.trim();
    const archive = filters.archived ?? 'all';

    const items = await this.prisma.stockItem.findMany({
      where: {
        quantity: { gt: 0 },
        productId: filters.productId,
        location: place,
        product: {
          kitchenId,
          ...(filters.unit ? { defaultUnit: filters.unit } : {}),
          ...(filters.category ? { category: filters.category } : {}),
          ...(archive === 'active'
            ? { archivedAt: null }
            : archive === 'archived'
              ? { archivedAt: { not: null } }
              : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { brand: { contains: search, mode: 'insensitive' } },
                  {
                    variantLabel: { contains: search, mode: 'insensitive' },
                  },
                  { ean: { contains: search } },
                  { category: { contains: search, mode: 'insensitive' } },
                  {
                    group: {
                      name: { contains: search, mode: 'insensitive' },
                    },
                  },
                ],
              }
            : {}),
        },
      },
      include: {
        product: { include: { group: true } },
        ...stockBatchInclude,
      },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    });

    const byProduct = new Map<string, StockListProductAggregate>();
    for (const item of items) {
      let agg = byProduct.get(item.productId);
      if (!agg) {
        agg = {
          productId: item.product.id,
          productName: item.product.name,
          defaultUnit: item.product.defaultUnit,
          category: item.product.category,
          isArchived: item.product.archivedAt !== null,
          brand: item.product.brand,
          variantLabel: item.product.variantLabel,
          groupId: item.product.groupId,
          groupName: item.product.group?.name ?? null,
          imageUrl: item.product.imageUrl,
          totalQuantity: new Prisma.Decimal(0),
          batchCount: 0,
          expiringBatchCount: 0,
          nearestExpiry: null,
          primaryLocation: item.location,
          latestBatchAt: item.createdAt,
          batches: [],
        };
        byProduct.set(item.productId, agg);
      }
      const batch = toStockBatchDetailDto(item, now);
      agg.batches.push(batch);
      agg.batchCount += 1;
      agg.totalQuantity = agg.totalQuantity.add(item.quantity);
      if (item.createdAt > agg.latestBatchAt) {
        agg.latestBatchAt = item.createdAt;
      }
      if (
        batch.expiresAt &&
        new Date(batch.expiresAt) <= new Date(now.getTime() + 7 * 86400000)
      ) {
        agg.expiringBatchCount += 1;
      }
      if (item.expiresAt) {
        if (!agg.nearestExpiry || item.expiresAt < agg.nearestExpiry) {
          agg.nearestExpiry = item.expiresAt;
        }
      }
    }

    const aggregates = Array.from(byProduct.values()).filter((agg) =>
      matchesExpiryStatus(agg.nearestExpiry, now, filters.expiryStatus),
    );

    const entries = sortStockListEntries(
      buildStockListEntries(aggregates),
      filters.sort,
      now,
    );

    return paginateStockListEntries(entries, filters.page, filters.limit);
  }

  /** Spłaszcza stronę zapasów do listy produktów (dla mobile / lokalnych helperów). */
  flattenStockSummaryPage(page: StockSummaryPageDto): StockProductSummaryDto[] {
    const out: StockProductSummaryDto[] = [];
    for (const item of page.items) {
      if (item.kind === 'product') {
        out.push(item.product);
      } else {
        out.push(...item.variants);
      }
    }
    return out;
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

  private async withRemovalHint(
    kitchenId: string,
    result: Omit<ProductIntakeResultDto, 'removalHint'> & {
      removalHint?: ProductIntakeResultDto['removalHint'];
    },
  ): Promise<ProductIntakeResultDto> {
    const canUndo = await this.computeCanUndoForProduct(
      kitchenId,
      result.product.id,
    );
    return {
      ...result,
      removalHint: { canUndo },
    };
  }

  private async computeCanUndoForProduct(
    kitchenId: string,
    productId: string,
  ): Promise<boolean> {
    try {
      const facts = await this.loadProductRemovalFactsForKnownProduct(
        kitchenId,
        productId,
      );
      return canUndoProductAddition(facts);
    } catch {
      return false;
    }
  }

  private async loadProductRemovalFacts(
    userId: string,
    kitchenId: string,
    productId: string,
  ): Promise<ProductRemovalFacts> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    return this.loadProductRemovalFactsForKnownProduct(kitchenId, productId);
  }

  private async loadProductRemovalFactsForKnownProduct(
    kitchenId: string,
    productId: string,
  ): Promise<ProductRemovalFacts> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, kitchenId },
      include: {
        nutrition: { select: { productId: true } },
        stockItems: {
          include: {
            purchaseLineItem: { select: { id: true } },
            _count: { select: { consumptionLines: true } },
          },
        },
        _count: {
          select: {
            purchaseLineItems: true,
            stockConsumptions: true,
            recipeIngredients: true,
            purchaseOptions: true,
          },
        },
      },
    });
    if (!product) {
      throw new BadRequestException('Nie znaleziono produktu.');
    }

    const pendingShoppingCount = await this.prisma.shoppingListItem.count({
      where: {
        productId: product.id,
        status: ShoppingListItemStatus.pending,
        shoppingList: { kitchenId },
      },
    });

    let remainingStockQuantity = new Prisma.Decimal(0);
    let purchaseLinkedStockItemCount = 0;
    let stockItemsWithConsumptionCount = 0;
    for (const item of product.stockItems) {
      remainingStockQuantity = remainingStockQuantity.plus(item.quantity);
      if (item.purchaseLineItem !== null) {
        purchaseLinkedStockItemCount += 1;
      }
      if (item._count.consumptionLines > 0) {
        stockItemsWithConsumptionCount += 1;
      }
    }

    return {
      isArchived: product.archivedAt !== null,
      pendingShoppingCount,
      recipeIngredientCount: product._count.recipeIngredients,
      purchaseLineItemCount: product._count.purchaseLineItems,
      stockConsumptionCount: product._count.stockConsumptions,
      purchaseLinkedStockItemCount,
      stockItemsWithConsumptionCount,
      stockItemCount: product.stockItems.length,
      hasNutrition: product.nutrition !== null,
      hasPurchaseOptions: product._count.purchaseOptions > 0,
      hasImageMedia: product.imageMediaId !== null,
      remainingStockQuantity,
      defaultUnit: product.defaultUnit,
    };
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
      'Nie można trwale usunąć produktu powiązanego z historią. Użyj archiwizacji albo cofnięcia dodania, gdy jest dostępne.',
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

function resolveIntakeStockQuantity(
  product: Product,
  stock: {
    quantity?: string;
    packageCount?: string;
  },
): Prisma.Decimal {
  const hasQuantity =
    stock.quantity !== undefined &&
    stock.quantity !== null &&
    stock.quantity.trim() !== '';
  const hasPackageCount =
    stock.packageCount !== undefined &&
    stock.packageCount !== null &&
    stock.packageCount.trim() !== '';

  if (hasQuantity === hasPackageCount) {
    throw new BadRequestException(
      'Podaj dokładnie jedno z: stock.quantity albo stock.packageCount.',
    );
  }

  if (hasPackageCount) {
    assertPackageCountAllowedForProduct(product);
    return packageCountToStockQuantity({
      packageCount: stock.packageCount!,
      packageQuantity: product.packageQuantity!,
      packageUnit: product.packageUnit!,
      defaultUnit: product.defaultUnit,
    }).quantity;
  }

  return parseQuantityString(stock.quantity!, 'quantity');
}

function resolvePackageSnapshot(
  product: Product,
  stock: { packageCount?: string },
): {
  packageCount: number | null;
  packageQuantitySnapshot: Prisma.Decimal | null;
  packageUnitSnapshot: PackageContentUnit | null;
} {
  const hasPackageCount =
    stock.packageCount !== undefined &&
    stock.packageCount !== null &&
    stock.packageCount.trim() !== '';
  if (!hasPackageCount) {
    return {
      packageCount: null,
      packageQuantitySnapshot: null,
      packageUnitSnapshot: null,
    };
  }
  assertPackageCountAllowedForProduct(product);
  return {
    packageCount: parsePositivePackageCount(stock.packageCount!),
    packageQuantitySnapshot: product.packageQuantity,
    packageUnitSnapshot: product.packageUnit,
  };
}

/**
 * Gdy produkt ma packageQuantity/packageUnit, a brak aktywnych opcji —
 * utwórz jedną domyślną (SKU = jedno opakowanie). Nie usuwa istniejących.
 */
async function ensureDefaultPurchaseOptionFromProductPackage(
  client: Prisma.TransactionClient | PrismaService,
  product: Product,
): Promise<void> {
  const active = await client.productPurchaseOption.count({
    where: { productId: product.id, isActive: true },
  });
  if (active > 0) {
    return;
  }
  if (product.packageQuantity === null || product.packageUnit === null) {
    throw new BadRequestException(
      'Tryb opakowań wymaga ilości w opakowaniu produktu albo istniejącej opcji zakupu.',
    );
  }
  await client.productPurchaseOption.create({
    data: {
      productId: product.id,
      name: 'Opakowanie',
      contentQuantity: convertPackageContentToProductUnit(
        product.packageQuantity,
        product.packageUnit,
        product.defaultUnit,
      ),
      contentUnit: product.defaultUnit,
      isDefault: true,
      isActive: true,
    },
  });
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
    storeName:
      item.purchaseLineItem?.purchase.storeName ?? item.storeName ?? null,
    purchaseId: item.purchaseLineItem?.purchase.id ?? null,
    receiptMediaId: item.purchaseLineItem?.purchase.receiptMediaId ?? null,
    packageCount: item.packageCount ?? null,
    packageQuantitySnapshot: item.packageQuantitySnapshot
      ? formatQuantity(item.packageQuantitySnapshot)
      : null,
    packageUnitSnapshot: item.packageUnitSnapshot ?? null,
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
    storeName: item.storeName ?? null,
    packageCount: item.packageCount ?? null,
    packageQuantitySnapshot: item.packageQuantitySnapshot
      ? formatQuantity(item.packageQuantitySnapshot)
      : null,
    packageUnitSnapshot: item.packageUnitSnapshot ?? null,
    currency: item.currency,
    ean: item.ean,
    imageUrl: item.imageUrl,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

type ProductNutritionWriteData = {
  baseQuantity: Prisma.Decimal;
  baseUnit: ProductUnit;
  kcal: Prisma.Decimal;
  proteinGrams: Prisma.Decimal;
  carbsGrams: Prisma.Decimal;
  fatGrams: Prisma.Decimal;
  fiberGrams: Prisma.Decimal | null;
  saltGrams: Prisma.Decimal | null;
  source: NutritionDataSource;
  sourceFetchedAt: Date | null;
  sourceLabel: string | null;
  sourceBrand: string | null;
  sourceGenericFoodId: string | null;
  sourceFdcId: number | null;
  sourcePieceGrams: Prisma.Decimal | null;
};

async function buildProductNutritionWriteData(
  client: Prisma.TransactionClient | PrismaService,
  product: Pick<Product, 'defaultUnit'>,
  dto: UpsertProductNutritionDto,
): Promise<ProductNutritionWriteData> {
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
    const catalogEntry = await client.usdaFoodCatalogEntry.findUnique({
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

  // Manual edits clear OFF/USDA provenance fields.
  return {
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
}

function replayIntakeResult(
  value: Prisma.JsonValue,
): Omit<ProductIntakeResultDto, 'removalHint'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConflictException(
      'Uszkodzony wynik idempotencji przyjęcia produktu.',
    );
  }
  const stored = value as unknown as ProductIntakeResultDto;
  return {
    product: stored.product,
    stockItem: stored.stockItem,
    restoredFromArchive: stored.restoredFromArchive,
    replayed: true,
  };
}
