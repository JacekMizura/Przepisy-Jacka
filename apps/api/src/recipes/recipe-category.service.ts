import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

import { requireKitchenMember } from '../kitchens/kitchen-access';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRecipeCategoryName } from './default-recipe-categories';
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
