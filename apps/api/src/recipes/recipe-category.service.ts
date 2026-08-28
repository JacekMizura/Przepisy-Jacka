import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

import { requireKitchenMember } from '../kitchens/kitchen-access';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_RECIPE_CATEGORIES,
  normalizeRecipeCategoryName,
} from './default-recipe-categories';
import {
  CreateRecipeCategoryDto,
  RecipeCategoryDto,
  UpdateRecipeCategoryDto,
} from './dto/recipe-category.dto';

@Injectable()
export class RecipeCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, kitchenId: string): Promise<RecipeCategoryDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    await this.ensureDefaultCategories(kitchenId);

    const categories = await this.prisma.recipeCategory.findMany({
      where: { kitchenId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return categories.map(toDto);
  }

  async create(
    userId: string,
    kitchenId: string,
    dto: CreateRecipeCategoryDto,
  ): Promise<RecipeCategoryDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    await this.ensureDefaultCategories(kitchenId);

    const name = dto.name.trim().replace(/\s+/g, ' ');
    const normalizedName = normalizeRecipeCategoryName(name);
    if (!normalizedName) {
      throw new BadRequestException('Nazwa kategorii jest wymagana.');
    }

    const maxSort = await this.prisma.recipeCategory.aggregate({
      where: { kitchenId },
      _max: { sortOrder: true },
    });

    try {
      const created = await this.prisma.recipeCategory.create({
        data: {
          kitchenId,
          name,
          normalizedName,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
      });
      return toDto(created);
    } catch (error) {
      throw mapCategoryWriteError(error);
    }
  }

  async update(
    userId: string,
    kitchenId: string,
    categoryId: string,
    dto: UpdateRecipeCategoryDto,
  ): Promise<RecipeCategoryDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const existing = await this.requireCategoryInKitchen(kitchenId, categoryId);

    if (dto.name === undefined) {
      return toDto(existing);
    }

    const name = dto.name.trim().replace(/\s+/g, ' ');
    const normalizedName = normalizeRecipeCategoryName(name);
    if (!normalizedName) {
      throw new BadRequestException('Nazwa kategorii jest wymagana.');
    }

    try {
      const updated = await this.prisma.recipeCategory.update({
        where: { id: categoryId },
        data: { name, normalizedName },
      });
      return toDto(updated);
    } catch (error) {
      throw mapCategoryWriteError(error);
    }
  }

  async remove(
    userId: string,
    kitchenId: string,
    categoryId: string,
  ): Promise<void> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    await this.requireCategoryInKitchen(kitchenId, categoryId);
    await this.prisma.recipeCategory.delete({ where: { id: categoryId } });
  }

  async ensureDefaultCategories(kitchenId: string): Promise<void> {
    const existing = await this.prisma.recipeCategory.findMany({
      where: { kitchenId },
      select: { normalizedName: true },
    });
    const known = new Set(existing.map((item) => item.normalizedName));
    const missing = DEFAULT_RECIPE_CATEGORIES.filter(
      (name) => !known.has(normalizeRecipeCategoryName(name)),
    );
    if (missing.length === 0) {
      return;
    }

    await this.prisma.recipeCategory.createMany({
      data: missing.map((name, index) => ({
        kitchenId,
        name,
        normalizedName: normalizeRecipeCategoryName(name),
        sortOrder:
          DEFAULT_RECIPE_CATEGORIES.indexOf(name) >= 0
            ? DEFAULT_RECIPE_CATEGORIES.indexOf(name)
            : existing.length + index,
      })),
      skipDuplicates: true,
    });
  }

  private async requireCategoryInKitchen(
    kitchenId: string,
    categoryId: string,
  ) {
    const category = await this.prisma.recipeCategory.findFirst({
      where: { id: categoryId, kitchenId },
    });
    if (!category) {
      throw new NotFoundException('Nie znaleziono kategorii.');
    }
    return category;
  }
}

function toDto(category: {
  id: string;
  kitchenId: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): RecipeCategoryDto {
  return {
    id: category.id,
    kitchenId: category.kitchenId,
    name: category.name,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

function mapCategoryWriteError(error: unknown): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new ConflictException(
      'Kategoria o tej nazwie już istnieje w kuchni.',
    );
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error('Nie udało się zapisać kategorii.');
}
