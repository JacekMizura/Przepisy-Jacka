import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProductUnit,
  type MediaAsset,
  type Product,
  type ProductGroup,
  type ProductNutrition,
  type ProductPurchaseOption,
} from '../generated/prisma/client';

import { normalizeProductName } from '../common/normalize';
import { formatQuantity } from '../common/quantity';
import { requireKitchenMember } from '../kitchens/kitchen-access';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignProductGroupDto,
  CatalogProductDto,
  CreateProductGroupDto,
  ProductGroupDetailDto,
  ProductGroupDto,
  ProductGroupStockByUnitDto,
  ProductGroupSummaryDto,
  UpdateProductGroupDto,
} from './dto/product-group.dto';
import type {
  CatalogListQueryDto,
  CatalogPageDto,
  CatalogSort,
} from './dto/catalog-list-query.dto';
import { ProductDto } from './dto/product.dto';
import { toProductDto } from './product-mapper';
import {
  buildPaginatedMeta,
  normalizePagination,
  slicePage,
} from '../common/pagination';

const productInclude = {
  purchaseOptions: {
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' as const }, { name: 'asc' as const }],
  },
  imageMedia: true,
  nutrition: true,
  group: { select: { id: true, name: true } },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Product & {
  purchaseOptions?: ProductPurchaseOption[];
  imageMedia?: MediaAsset | null;
  nutrition?: ProductNutrition | null;
  group?: { id: string; name: string } | null;
};

type ArchiveFilter = 'active' | 'archived' | 'all';

@Injectable()
export class ProductGroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async listGroups(
    userId: string,
    kitchenId: string,
    options: { search?: string; archive?: ArchiveFilter } = {},
  ): Promise<ProductGroupSummaryDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const archive = options.archive ?? 'active';
    const matchingIds = options.search
      ? await this.findGroupIdsBySearch(kitchenId, options.search)
      : null;

    const groups = await this.prisma.productGroup.findMany({
      where: {
        kitchenId,
        ...(matchingIds ? { id: { in: matchingIds } } : {}),
      },
      orderBy: [{ name: 'asc' }],
    });

    return Promise.all(
      groups.map((group) => this.buildGroupSummary(group, archive)),
    );
  }

  async searchGroups(
    userId: string,
    kitchenId: string,
    q: string,
  ): Promise<ProductGroupDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const normalized = normalizeProductName(q);
    if (!normalized) {
      return [];
    }
    const groups = await this.prisma.productGroup.findMany({
      where: { kitchenId },
      orderBy: [{ name: 'asc' }],
      take: 40,
    });
    return groups
      .filter(
        (group) =>
          group.normalizedName.includes(normalized) ||
          normalized.includes(group.normalizedName),
      )
      .slice(0, 10)
      .map(toProductGroupDto);
  }

  async getGroup(
    userId: string,
    kitchenId: string,
    groupId: string,
  ): Promise<ProductGroupDetailDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const group = await this.prisma.productGroup.findFirst({
      where: { id: groupId, kitchenId },
    });
    if (!group) {
      throw new NotFoundException('Nie znaleziono grupy produktów.');
    }
    const products = await this.prisma.product.findMany({
      where: { kitchenId, groupId: group.id },
      include: productInclude,
      orderBy: [{ name: 'asc' }],
    });
    const summary = await this.buildGroupSummary(group, 'all');
    return {
      ...toProductGroupDto(group),
      products: await Promise.all(
        products.map((product) => this.toProductDtoWithMedia(product)),
      ),
      summary,
    };
  }

  async createGroup(
    userId: string,
    kitchenId: string,
    dto: CreateProductGroupDto,
  ): Promise<ProductGroupDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    return this.createGroupInClient(this.prisma, kitchenId, dto.name);
  }

  async updateGroup(
    userId: string,
    kitchenId: string,
    groupId: string,
    dto: UpdateProductGroupDto,
  ): Promise<ProductGroupDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const existing = await this.prisma.productGroup.findFirst({
      where: { id: groupId, kitchenId },
    });
    if (!existing) {
      throw new NotFoundException('Nie znaleziono grupy produktów.');
    }
    const name = dto.name.trim();
    const normalizedName = normalizeProductName(name);
    if (!normalizedName) {
      throw new BadRequestException('Nazwa grupy jest wymagana.');
    }
    try {
      const updated = await this.prisma.productGroup.update({
        where: { id: existing.id },
        data: { name, normalizedName },
      });
      return toProductGroupDto(updated);
    } catch (error) {
      throw toGroupWriteError(error);
    }
  }

  async deleteGroup(
    userId: string,
    kitchenId: string,
    groupId: string,
  ): Promise<{ ok: true }> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const existing = await this.prisma.productGroup.findFirst({
      where: { id: groupId, kitchenId },
    });
    if (!existing) {
      throw new NotFoundException('Nie znaleziono grupy produktów.');
    }
    await this.prisma.productGroup.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  async assignProduct(
    userId: string,
    kitchenId: string,
    productId: string,
    dto: AssignProductGroupDto,
  ): Promise<ProductDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, kitchenId },
    });
    if (!product) {
      throw new BadRequestException('Nie znaleziono produktu w tej kuchni.');
    }
    if (dto.groupId !== null) {
      const group = await this.prisma.productGroup.findFirst({
        where: { id: dto.groupId, kitchenId },
        select: { id: true },
      });
      if (!group) {
        throw new BadRequestException(
          'Nie znaleziono grupy produktów w tej kuchni.',
        );
      }
    }
    const updated = await this.prisma.product.update({
      where: { id: product.id },
      data: { groupId: dto.groupId },
      include: productInclude,
    });
    return this.toProductDtoWithMedia(updated);
  }

  async listCatalog(
    userId: string,
    kitchenId: string,
    options: CatalogListQueryDto = {},
  ): Promise<CatalogPageDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const { page, limit } = normalizePagination({
      page: options.page,
      limit: options.limit,
    });
    const search = options.search?.trim();
    const archive = options.archived ?? 'active';
    const hasStock = options.hasStock === 'true' || options.hasStock === '1';
    const sort: CatalogSort = options.sort ?? 'name';

    const products = await this.prisma.product.findMany({
      where: {
        kitchenId,
        ...(archive === 'active'
          ? { archivedAt: null }
          : archive === 'archived'
            ? { archivedAt: { not: null } }
            : {}),
        ...(options.category ? { category: options.category } : {}),
        ...(options.unit ? { defaultUnit: options.unit } : {}),
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
        ...(hasStock || options.place
          ? {
              stockItems: {
                some: {
                  quantity: { gt: 0 },
                  ...(options.place ? { location: options.place } : {}),
                },
              },
            }
          : {}),
      },
      include: {
        ...productInclude,
        stockItems: {
          where: {
            quantity: { gt: 0 },
            ...(options.place ? { location: options.place } : {}),
          },
          select: { quantity: true },
        },
      },
    });

    type CatalogAgg = {
      dto: CatalogProductDto;
      groupId: string | null;
      groupName: string | null;
      stockQty: number;
      createdAt: Date;
      updatedAt: Date;
    };

    const aggregates: CatalogAgg[] = await Promise.all(
      products.map(async (product) => {
        const base = await this.toProductDtoWithMedia(product);
        const total = product.stockItems.reduce(
          (acc, item) => acc.add(item.quantity),
          new Prisma.Decimal(0),
        );
        return {
          dto: {
            ...base,
            batchCount: product.stockItems.length,
            totalQuantity: formatQuantity(total),
          },
          groupId: product.groupId,
          groupName: product.group?.name ?? null,
          stockQty: Number(total.toString()),
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        };
      }),
    );

    type Entry =
      | {
          kind: 'product';
          product: CatalogProductDto;
          groupName: string | null;
          sortName: string;
          stockQty: number;
          createdAt: Date;
          updatedAt: Date;
        }
      | {
          kind: 'group';
          groupId: string;
          groupName: string;
          variantCount: number;
          batchCount: number;
          totalQuantity: string;
          defaultUnit: ProductUnit;
          variants: CatalogProductDto[];
          sortName: string;
          stockQty: number;
          createdAt: Date;
          updatedAt: Date;
        };

    const byGroup = new Map<string, CatalogAgg[]>();
    const singles: CatalogAgg[] = [];
    for (const agg of aggregates) {
      if (!agg.groupId) {
        singles.push(agg);
        continue;
      }
      const list = byGroup.get(agg.groupId) ?? [];
      list.push(agg);
      byGroup.set(agg.groupId, list);
    }

    const entries: Entry[] = [];
    for (const agg of singles) {
      entries.push({
        kind: 'product',
        product: agg.dto,
        groupName: null,
        sortName: agg.dto.name,
        stockQty: agg.stockQty,
        createdAt: agg.createdAt,
        updatedAt: agg.updatedAt,
      });
    }
    for (const [, variants] of byGroup) {
      if (variants.length === 1) {
        const only = variants[0]!;
        entries.push({
          kind: 'product',
          product: only.dto,
          groupName: only.groupName,
          sortName: only.dto.name,
          stockQty: only.stockQty,
          createdAt: only.createdAt,
          updatedAt: only.updatedAt,
        });
        continue;
      }
      let stockQty = 0;
      let batchCount = 0;
      let createdAt = variants[0]!.createdAt;
      let updatedAt = variants[0]!.updatedAt;
      const unitCounts = new Map<ProductUnit, number>();
      for (const v of variants) {
        stockQty += v.stockQty;
        batchCount += v.dto.batchCount;
        if (v.createdAt > createdAt) createdAt = v.createdAt;
        if (v.updatedAt > updatedAt) updatedAt = v.updatedAt;
        unitCounts.set(
          v.dto.defaultUnit,
          (unitCounts.get(v.dto.defaultUnit) ?? 0) + 1,
        );
      }
      let defaultUnit = variants[0]!.dto.defaultUnit;
      let best = 0;
      for (const [unit, count] of unitCounts) {
        if (count > best) {
          best = count;
          defaultUnit = unit;
        }
      }
      const first = variants[0]!;
      entries.push({
        kind: 'group',
        groupId: first.groupId!,
        groupName: first.groupName ?? 'Rodzaj',
        variantCount: variants.length,
        batchCount,
        totalQuantity: stockQty.toFixed(3),
        defaultUnit,
        variants: variants
          .map((v) => v.dto)
          .sort((a, b) => a.name.localeCompare(b.name, 'pl')),
        sortName: first.groupName ?? 'Rodzaj',
        stockQty,
        createdAt,
        updatedAt,
      });
    }

    entries.sort((a, b) => {
      if (sort === 'newest') {
        return b.createdAt.getTime() - a.createdAt.getTime();
      }
      if (sort === 'updated') {
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      }
      if (sort === 'has_stock') {
        if (a.stockQty > 0 !== b.stockQty > 0) {
          return a.stockQty > 0 ? -1 : 1;
        }
        return a.sortName.localeCompare(b.sortName, 'pl');
      }
      return a.sortName.localeCompare(b.sortName, 'pl');
    });

    const total = entries.length;
    const pageEntries = slicePage(entries, page, limit);

    return {
      items: pageEntries.map((entry) => {
        if (entry.kind === 'product') {
          return {
            kind: 'product' as const,
            product: entry.product,
            groupName: entry.groupName,
          };
        }
        return {
          kind: 'group' as const,
          groupId: entry.groupId,
          groupName: entry.groupName,
          variantCount: entry.variantCount,
          batchCount: entry.batchCount,
          totalQuantity: entry.totalQuantity,
          defaultUnit: entry.defaultUnit,
          variants: entry.variants,
        };
      }),
      ...buildPaginatedMeta(total, page, limit),
    };
  }

  async createGroupInClient(
    client: Prisma.TransactionClient | PrismaService,
    kitchenId: string,
    rawName: string,
  ): Promise<ProductGroupDto> {
    const name = rawName.trim();
    const normalizedName = normalizeProductName(name);
    if (!normalizedName) {
      throw new BadRequestException('Nazwa grupy jest wymagana.');
    }
    try {
      const group = await client.productGroup.create({
        data: { kitchenId, name, normalizedName },
      });
      return toProductGroupDto(group);
    } catch (error) {
      throw toGroupWriteError(error);
    }
  }

  async assertGroupInKitchen(
    client: Prisma.TransactionClient | PrismaService,
    kitchenId: string,
    groupId: string,
  ): Promise<void> {
    const group = await client.productGroup.findFirst({
      where: { id: groupId, kitchenId },
      select: { id: true },
    });
    if (!group) {
      throw new BadRequestException(
        'Nie znaleziono grupy produktów w tej kuchni.',
      );
    }
  }

  async suggestGroupsByName(
    kitchenId: string,
    nameQuery: string,
  ): Promise<ProductGroupDto[]> {
    const normalized = normalizeProductName(nameQuery);
    if (!normalized) {
      return [];
    }
    const groups = await this.prisma.productGroup.findMany({
      where: { kitchenId },
      orderBy: [{ name: 'asc' }],
      take: 40,
    });
    return groups
      .filter(
        (group) =>
          group.normalizedName.includes(normalized) ||
          normalized.includes(group.normalizedName),
      )
      .slice(0, 5)
      .map(toProductGroupDto);
  }

  private async findGroupIdsBySearch(
    kitchenId: string,
    search: string,
  ): Promise<string[]> {
    const trimmed = search.trim();
    if (!trimmed) {
      return [];
    }
    const groups = await this.prisma.productGroup.findMany({
      where: {
        kitchenId,
        OR: [
          { name: { contains: trimmed, mode: 'insensitive' } },
          {
            products: {
              some: {
                OR: [
                  { name: { contains: trimmed, mode: 'insensitive' } },
                  { brand: { contains: trimmed, mode: 'insensitive' } },
                  {
                    variantLabel: { contains: trimmed, mode: 'insensitive' },
                  },
                  { ean: { contains: trimmed } },
                ],
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    return groups.map((group) => group.id);
  }

  private async buildGroupSummary(
    group: ProductGroup,
    archive: ArchiveFilter,
  ): Promise<ProductGroupSummaryDto> {
    const products = await this.prisma.product.findMany({
      where: {
        groupId: group.id,
        ...(archive === 'active'
          ? { archivedAt: null }
          : archive === 'archived'
            ? { archivedAt: { not: null } }
            : {}),
      },
      include: {
        imageMedia: true,
        nutrition: { select: { productId: true } },
        stockItems: { select: { quantity: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const allInGroup = await this.prisma.product.count({
      where: { groupId: group.id },
    });
    const activeInGroup = await this.prisma.product.count({
      where: { groupId: group.id, archivedAt: null },
    });

    const stockByUnitMap = new Map<ProductUnit, Prisma.Decimal>();
    let batchCount = 0;
    for (const product of products) {
      batchCount += product.stockItems.length;
      if (product.stockItems.length === 0) {
        continue;
      }
      const sum = product.stockItems.reduce(
        (acc, item) => acc.add(item.quantity),
        new Prisma.Decimal(0),
      );
      const prev =
        stockByUnitMap.get(product.defaultUnit) ?? new Prisma.Decimal(0);
      stockByUnitMap.set(product.defaultUnit, prev.add(sum));
    }

    const stockByUnit: ProductGroupStockByUnitDto[] = [
      ...stockByUnitMap.entries(),
    ]
      .map(([unit, totalQuantity]) => ({
        unit,
        totalQuantity: formatQuantity(totalQuantity),
      }))
      .sort((a, b) => a.unit.localeCompare(b.unit));

    const coverImages = [];
    for (const product of products) {
      if (coverImages.length >= 4) {
        break;
      }
      const image = await this.mediaService.buildImageSummary(
        product.imageMedia ?? null,
      );
      if (image) {
        coverImages.push(image);
      }
    }

    return {
      id: group.id,
      name: group.name,
      productCount: allInGroup,
      activeProductCount: activeInGroup,
      batchCount,
      stockByUnit,
      coverImages,
      hasNutritionCount: products.filter((product) => product.nutrition).length,
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
}

export function toProductGroupDto(group: ProductGroup): ProductGroupDto {
  return {
    id: group.id,
    kitchenId: group.kitchenId,
    name: group.name,
    normalizedName: group.normalizedName,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

function toGroupWriteError(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new ConflictException('Grupa o tej nazwie już istnieje w kuchni.');
  }
  return error instanceof Error ? error : new Error('Nieznany błąd zapisu.');
}
