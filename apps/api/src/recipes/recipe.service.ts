import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  RecipeVisibility,
  type Recipe,
  type RecipeGapAddition,
  type RecipeIngredient,
  type RecipeStep,
  type User,
} from '../generated/prisma/client';

import { formatQuantity, parseQuantityString } from '../common/quantity';
import { requireKitchenMember } from '../kitchens/kitchen-access';
import { PrismaService } from '../prisma/prisma.service';
import { ShoppingService } from '../shopping/shopping.service';
import {
  AddedRecipeGapItemDto,
  AddRecipeGapsDto,
  AddRecipeGapsResultDto,
  SkippedRecipeGapItemDto,
} from './dto/add-recipe-gaps.dto';
import { RecipeAvailabilityDto } from './dto/recipe-availability.dto';
import {
  CreateRecipeDto,
  RecipeDetailDto,
  RecipeIngredientInputDto,
  RecipeStepInputDto,
  RecipeSummaryDto,
  UpdateRecipeDto,
} from './dto/recipe.dto';
import {
  computeRecipeAvailability,
  recipeUnitToShoppingInputUnit,
} from './recipe-availability';

type RecipeWithRelations = Recipe & {
  author: Pick<User, 'id' | 'name'>;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
};

type StoredGapAdditionResult = AddRecipeGapsResultDto & {
  kitchenId: string;
  includeIngredientIds: string[];
  pending?: boolean;
};

export type RecipeListFilter = 'all' | 'mine' | 'kitchen';

@Injectable()
export class RecipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shoppingService: ShoppingService,
  ) {}

  async listRecipes(
    userId: string,
    kitchenId: string,
    filters: { search?: string; filter?: RecipeListFilter },
  ): Promise<RecipeSummaryDto[]> {
    await requireKitchenMember(this.prisma, kitchenId, userId);

    const visibilityFilter = buildVisibilityFilter(
      userId,
      filters.filter ?? 'all',
    );
    const search = filters.search?.trim();

    const recipes = await this.prisma.recipe.findMany({
      where: {
        kitchenId,
        ...visibilityFilter,
        ...(search
          ? { name: { contains: search, mode: 'insensitive' as const } }
          : {}),
      },
      include: {
        author: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });

    return recipes.map(toRecipeSummaryDto);
  }

  async createRecipe(
    userId: string,
    kitchenId: string,
    dto: CreateRecipeDto,
  ): Promise<RecipeDetailDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    validateRecipeStructure(dto.ingredients, dto.steps);
    await validateIngredientProducts(this.prisma, kitchenId, dto.ingredients);

    const recipe = await this.prisma.$transaction(async (tx) => {
      const created = await tx.recipe.create({
        data: {
          kitchenId,
          authorUserId: userId,
          name: dto.name.trim(),
          description: normalizeOptionalText(dto.description),
          servings: dto.servings,
          prepTimeMinutes: dto.prepTimeMinutes ?? null,
          cookTimeMinutes: dto.cookTimeMinutes ?? null,
          difficulty: dto.difficulty,
          tags: normalizeTags(dto.tags),
          visibility: dto.visibility ?? RecipeVisibility.private,
          sourceUrl: normalizeOptionalText(dto.sourceUrl),
          ingredients: {
            create: dto.ingredients.map((ingredient) =>
              toIngredientCreateData(ingredient),
            ),
          },
          steps: {
            create: dto.steps.map((step) => toStepCreateData(step)),
          },
        },
        include: recipeInclude,
      });
      return created;
    });

    return toRecipeDetailDto(recipe);
  }

  async getRecipe(
    userId: string,
    kitchenId: string,
    recipeId: string,
  ): Promise<RecipeDetailDto> {
    const recipe = await this.findAccessibleRecipe(userId, kitchenId, recipeId);
    return toRecipeDetailDto(recipe);
  }

  async updateRecipe(
    userId: string,
    kitchenId: string,
    recipeId: string,
    dto: UpdateRecipeDto,
  ): Promise<RecipeDetailDto> {
    const existing = await this.findAccessibleRecipe(
      userId,
      kitchenId,
      recipeId,
    );
    assertRecipeAuthor(existing, userId);

    if (dto.ingredients !== undefined || dto.steps !== undefined) {
      validateRecipeStructure(
        dto.ingredients ??
          existing.ingredients.map(toIngredientInputFromEntity),
        dto.steps ?? existing.steps.map(toStepInputFromEntity),
      );
    }
    if (dto.ingredients !== undefined) {
      await validateIngredientProducts(this.prisma, kitchenId, dto.ingredients);
    }

    const recipe = await this.prisma.$transaction(async (tx) => {
      if (dto.ingredients !== undefined) {
        await tx.recipeIngredient.deleteMany({ where: { recipeId } });
      }
      if (dto.steps !== undefined) {
        await tx.recipeStep.deleteMany({ where: { recipeId } });
      }

      return tx.recipe.update({
        where: { id: recipeId },
        data: {
          name: dto.name?.trim(),
          description:
            dto.description === undefined
              ? undefined
              : normalizeOptionalText(dto.description),
          servings: dto.servings,
          prepTimeMinutes:
            dto.prepTimeMinutes === undefined ? undefined : dto.prepTimeMinutes,
          cookTimeMinutes:
            dto.cookTimeMinutes === undefined ? undefined : dto.cookTimeMinutes,
          difficulty: dto.difficulty,
          tags: dto.tags === undefined ? undefined : normalizeTags(dto.tags),
          visibility: dto.visibility,
          sourceUrl:
            dto.sourceUrl === undefined
              ? undefined
              : normalizeOptionalText(dto.sourceUrl),
          ingredients:
            dto.ingredients === undefined
              ? undefined
              : {
                  create: dto.ingredients.map((ingredient) =>
                    toIngredientCreateData(ingredient),
                  ),
                },
          steps:
            dto.steps === undefined
              ? undefined
              : {
                  create: dto.steps.map((step) => toStepCreateData(step)),
                },
        },
        include: recipeInclude,
      });
    });

    return toRecipeDetailDto(recipe);
  }

  async deleteRecipe(
    userId: string,
    kitchenId: string,
    recipeId: string,
  ): Promise<void> {
    const existing = await this.findAccessibleRecipe(
      userId,
      kitchenId,
      recipeId,
    );
    assertRecipeAuthor(existing, userId);
    await this.prisma.recipe.delete({ where: { id: recipeId } });
  }

  async getAvailability(
    userId: string,
    kitchenId: string,
    recipeId: string,
    servings: number,
  ): Promise<RecipeAvailabilityDto> {
    if (!Number.isInteger(servings) || servings < 1) {
      throw new BadRequestException('servings musi być liczbą całkowitą >= 1.');
    }

    const recipe = await this.findAccessibleRecipe(userId, kitchenId, recipeId);
    return this.computeAvailabilityForRecipe(recipe, kitchenId, servings);
  }

  async addGapsToShoppingList(
    userId: string,
    kitchenId: string,
    recipeId: string,
    dto: AddRecipeGapsDto,
  ): Promise<AddRecipeGapsResultDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);

    const includeIngredientIds = normalizeIncludeIngredientIds(
      dto.includeIngredientIds,
    );

    const existingAddition = await this.prisma.recipeGapAddition.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existingAddition) {
      return resolveExistingGapAddition(
        this.prisma,
        existingAddition,
        kitchenId,
        recipeId,
        dto.servings,
        includeIngredientIds,
      );
    }

    const recipe = await this.findAccessibleRecipe(userId, kitchenId, recipeId);
    const availability = await this.computeAvailabilityForRecipe(
      recipe,
      kitchenId,
      dto.servings,
    );

    const includeSet = new Set(includeIngredientIds);
    const candidates: Array<{
      ingredientId: string;
      ingredientName: string;
      productId: string;
      quantity: string;
      shoppingUnit: 'piece' | 'gram' | 'kilogram' | 'milliliter' | 'liter';
    }> = [];
    const skipped: SkippedRecipeGapItemDto[] = [];

    for (const ingredient of availability.ingredients) {
      if (ingredient.status === 'available') {
        skipped.push({
          ingredientId: ingredient.ingredientId,
          ingredientName: ingredient.name,
          reason: 'available',
        });
        continue;
      }

      if (ingredient.status === 'unknown') {
        if (!includeSet.has(ingredient.ingredientId)) {
          skipped.push({
            ingredientId: ingredient.ingredientId,
            ingredientName: ingredient.name,
            reason: 'unknown',
          });
          continue;
        }
        if (!ingredient.productId || !ingredient.scaledQuantity) {
          skipped.push({
            ingredientId: ingredient.ingredientId,
            ingredientName: ingredient.name,
            reason: 'unknown_not_linkable',
          });
          continue;
        }
      }

      if (
        (ingredient.status === 'partial' || ingredient.status === 'missing') &&
        (!ingredient.gapQuantity ||
          !ingredient.gapUnit ||
          !ingredient.productId)
      ) {
        skipped.push({
          ingredientId: ingredient.ingredientId,
          ingredientName: ingredient.name,
          reason: 'not_addable',
        });
        continue;
      }

      const unitForShopping =
        ingredient.status === 'unknown' ? ingredient.unit : ingredient.gapUnit!;
      const shoppingUnit = recipeUnitToShoppingInputUnit(unitForShopping);
      if (!shoppingUnit) {
        skipped.push({
          ingredientId: ingredient.ingredientId,
          ingredientName: ingredient.name,
          reason: 'unsupported_unit',
        });
        continue;
      }

      const quantity =
        ingredient.status === 'unknown'
          ? ingredient.scaledQuantity!
          : ingredient.gapQuantity!;

      candidates.push({
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.name,
        productId: ingredient.productId!,
        quantity,
        shoppingUnit,
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const raced = await tx.recipeGapAddition.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (raced) {
          return resolveExistingGapAddition(
            tx,
            raced,
            kitchenId,
            recipeId,
            dto.servings,
            includeIngredientIds,
          );
        }

        await tx.recipeGapAddition.create({
          data: {
            recipeId,
            idempotencyKey: dto.idempotencyKey,
            servings: dto.servings,
            createdByUserId: userId,
            result: {
              pending: true,
              kitchenId,
              includeIngredientIds,
            },
          },
        });

        const added: AddedRecipeGapItemDto[] = [];
        for (const candidate of candidates) {
          const shoppingItem =
            await this.shoppingService.createShoppingListItemInTx(
              tx,
              kitchenId,
              {
                productId: candidate.productId,
                plannedQuantity: candidate.quantity,
                plannedUnit: candidate.shoppingUnit,
                note: `Przepis: ${recipe.name}`,
                mergeQuantity: true,
              },
            );

          added.push({
            ingredientId: candidate.ingredientId,
            ingredientName: candidate.ingredientName,
            productId: candidate.productId,
            quantity: candidate.quantity,
            unit: candidate.shoppingUnit,
            shoppingListItemId: shoppingItem.id,
          });
        }

        const result: StoredGapAdditionResult = {
          recipeId,
          servings: dto.servings,
          idempotencyKey: dto.idempotencyKey,
          added,
          skipped,
          createdAt: new Date().toISOString(),
          kitchenId,
          includeIngredientIds,
        };

        await tx.recipeGapAddition.update({
          where: { idempotencyKey: dto.idempotencyKey },
          data: { result: result as unknown as Prisma.InputJsonValue },
        });

        return toPublicGapResult(result);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.recipeGapAddition.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (raced) {
          return resolveExistingGapAddition(
            this.prisma,
            raced,
            kitchenId,
            recipeId,
            dto.servings,
            includeIngredientIds,
          );
        }
      }
      throw error;
    }
  }

  private async computeAvailabilityForRecipe(
    recipe: RecipeWithRelations,
    kitchenId: string,
    servings: number,
  ): Promise<RecipeAvailabilityDto> {
    const productIds = recipe.ingredients
      .map((ingredient) => ingredient.productId)
      .filter((productId): productId is string => productId !== null);

    const [stockItems, products] = await Promise.all([
      productIds.length === 0
        ? Promise.resolve([])
        : this.prisma.stockItem.findMany({
            where: {
              product: { kitchenId },
              productId: { in: productIds },
            },
            select: {
              productId: true,
              quantity: true,
              expiresAt: true,
            },
          }),
      productIds.length === 0
        ? Promise.resolve([])
        : this.prisma.product.findMany({
            where: { kitchenId, id: { in: productIds } },
          }),
    ]);

    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    return computeRecipeAvailability({
      recipeId: recipe.id,
      baseServings: recipe.servings,
      servings,
      ingredients: recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        product: ingredient.productId
          ? (productById.get(ingredient.productId) ?? null)
          : null,
      })),
      stockItems,
    });
  }

  private async findAccessibleRecipe(
    userId: string,
    kitchenId: string,
    recipeId: string,
  ): Promise<RecipeWithRelations> {
    await requireKitchenMember(this.prisma, kitchenId, userId);

    const recipe = await this.prisma.recipe.findFirst({
      where: { id: recipeId, kitchenId },
      include: recipeInclude,
    });
    if (!recipe) {
      throw new NotFoundException('Nie znaleziono przepisu.');
    }
    if (
      recipe.visibility === RecipeVisibility.private &&
      recipe.authorUserId !== userId
    ) {
      throw new NotFoundException('Nie znaleziono przepisu.');
    }
    return recipe;
  }
}

const recipeInclude = {
  author: { select: { id: true, name: true } },
  ingredients: { orderBy: { sortOrder: 'asc' as const } },
  steps: { orderBy: { sortOrder: 'asc' as const } },
};

function buildVisibilityFilter(
  userId: string,
  filter: RecipeListFilter,
): Prisma.RecipeWhereInput {
  switch (filter) {
    case 'mine':
      return { authorUserId: userId };
    case 'kitchen':
      return { visibility: RecipeVisibility.kitchen };
    case 'all':
    default:
      return {
        OR: [
          { authorUserId: userId },
          { visibility: RecipeVisibility.kitchen },
        ],
      };
  }
}

function assertRecipeAuthor(recipe: Recipe, userId: string): void {
  if (recipe.authorUserId !== userId) {
    throw new ForbiddenException(
      'Tę operację może wykonać wyłącznie autor przepisu.',
    );
  }
}

function validateRecipeStructure(
  ingredients: RecipeIngredientInputDto[],
  steps: RecipeStepInputDto[],
): void {
  if (ingredients.length === 0) {
    throw new BadRequestException(
      'Przepis musi mieć co najmniej jeden składnik.',
    );
  }
  if (steps.length === 0) {
    throw new BadRequestException('Przepis musi mieć co najmniej jeden krok.');
  }
  assertUniqueSortOrders(
    ingredients.map((item) => item.sortOrder),
    'składników',
  );
  assertUniqueSortOrders(
    steps.map((item) => item.sortOrder),
    'kroków',
  );
}

function assertUniqueSortOrders(values: number[], label: string): void {
  const unique = new Set(values);
  if (unique.size !== values.length) {
    throw new BadRequestException(`Kolejność ${label} musi być unikalna.`);
  }
}

async function validateIngredientProducts(
  prisma: PrismaService,
  kitchenId: string,
  ingredients: RecipeIngredientInputDto[],
): Promise<void> {
  const productIds = ingredients
    .map((ingredient) => ingredient.productId)
    .filter((productId): productId is string => Boolean(productId));
  if (productIds.length === 0) {
    return;
  }

  const products = await prisma.product.findMany({
    where: { kitchenId, id: { in: productIds } },
    select: { id: true },
  });
  const known = new Set(products.map((product) => product.id));
  for (const productId of productIds) {
    if (!known.has(productId)) {
      throw new BadRequestException('Nie znaleziono produktu w tej kuchni.');
    }
  }
}

function normalizeIncludeIngredientIds(ids?: string[]): string[] {
  return [...(ids ?? [])].sort();
}

function sameIncludeIngredientIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((id, index) => id === right[index]);
}

function toPublicGapResult(
  stored: StoredGapAdditionResult,
): AddRecipeGapsResultDto {
  return {
    recipeId: stored.recipeId,
    servings: stored.servings,
    idempotencyKey: stored.idempotencyKey,
    added: stored.added,
    skipped: stored.skipped,
    createdAt: stored.createdAt,
  };
}

async function resolveExistingGapAddition(
  prisma: Pick<PrismaService, 'recipe'>,
  existing: RecipeGapAddition,
  kitchenId: string,
  recipeId: string,
  servings: number,
  includeIngredientIds: string[],
): Promise<AddRecipeGapsResultDto> {
  if (existing.recipeId !== recipeId || existing.servings !== servings) {
    throw new ConflictException('Klucz idempotencji jest już użyty.');
  }

  const recipe = await prisma.recipe.findUnique({
    where: { id: existing.recipeId },
    select: { kitchenId: true },
  });
  if (!recipe || recipe.kitchenId !== kitchenId) {
    throw new ConflictException('Klucz idempotencji jest już użyty.');
  }

  const stored = existing.result as unknown as StoredGapAdditionResult;
  if (stored.pending) {
    throw new ConflictException('Operacja z tym kluczem jest w toku.');
  }
  if (stored.kitchenId !== kitchenId) {
    throw new ConflictException('Klucz idempotencji jest już użyty.');
  }
  const storedIncludes = normalizeIncludeIngredientIds(
    stored.includeIngredientIds,
  );
  if (!sameIncludeIngredientIds(storedIncludes, includeIngredientIds)) {
    throw new ConflictException('Klucz idempotencji jest już użyty.');
  }

  return toPublicGapResult(stored);
}

function toIngredientCreateData(ingredient: RecipeIngredientInputDto) {
  return {
    name: ingredient.name.trim(),
    quantity:
      ingredient.quantity === undefined || ingredient.quantity === null
        ? null
        : parseQuantityString(ingredient.quantity, 'quantity'),
    unit: ingredient.unit,
    note: normalizeOptionalText(ingredient.note),
    productId: ingredient.productId ?? null,
    sortOrder: ingredient.sortOrder,
  };
}

function toStepCreateData(step: RecipeStepInputDto) {
  return {
    instruction: step.instruction.trim(),
    sortOrder: step.sortOrder,
  };
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) {
    return [];
  }
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 20);
}

function toIngredientInputFromEntity(
  ingredient: RecipeIngredient,
): RecipeIngredientInputDto {
  return {
    name: ingredient.name,
    quantity:
      ingredient.quantity !== null ? formatQuantity(ingredient.quantity) : null,
    unit: ingredient.unit,
    note: ingredient.note,
    productId: ingredient.productId,
    sortOrder: ingredient.sortOrder,
  };
}

function toStepInputFromEntity(step: RecipeStep): RecipeStepInputDto {
  return {
    instruction: step.instruction,
    sortOrder: step.sortOrder,
  };
}

function toRecipeSummaryDto(
  recipe: Recipe & { author: Pick<User, 'id' | 'name'> },
): RecipeSummaryDto {
  return {
    id: recipe.id,
    kitchenId: recipe.kitchenId,
    name: recipe.name,
    description: recipe.description,
    servings: recipe.servings,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    difficulty: recipe.difficulty,
    tags: recipe.tags,
    visibility: recipe.visibility,
    author: {
      id: recipe.author.id,
      name: recipe.author.name,
    },
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
  };
}

function toRecipeDetailDto(recipe: RecipeWithRelations): RecipeDetailDto {
  return {
    ...toRecipeSummaryDto(recipe),
    sourceUrl: recipe.sourceUrl,
    ingredients: recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      quantity:
        ingredient.quantity !== null
          ? formatQuantity(ingredient.quantity)
          : null,
      unit: ingredient.unit,
      note: ingredient.note,
      productId: ingredient.productId,
      sortOrder: ingredient.sortOrder,
    })),
    steps: recipe.steps.map((step) => ({
      id: step.id,
      instruction: step.instruction,
      sortOrder: step.sortOrder,
    })),
  };
}
