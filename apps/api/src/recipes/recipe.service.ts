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
  ProductPurchaseMode,
  ProductUnit,
  type MediaAsset,
  type Recipe,
  type RecipeGapAddition,
  type RecipeIngredient,
  type RecipeIngredientGroup,
  type RecipeStep,
  type User,
} from '../generated/prisma/client';

import { formatQuantity, parseQuantityString } from '../common/quantity';
import { requireKitchenMember } from '../kitchens/kitchen-access';
import { MediaImageDto } from '../media/dto/media.dto';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShoppingService } from '../shopping/shopping.service';
import { PRODUCT_PURCHASE_CONFIG_REQUIRED_MESSAGE } from '../stock/purchase-mode.messages';
import {
  AddedRecipeGapItemDto,
  AddRecipeGapsDto,
  AddRecipeGapsResultDto,
  RecipeGapSelectionDto,
  SkippedRecipeGapItemDto,
} from './dto/add-recipe-gaps.dto';
import { RecipeAvailabilityDto } from './dto/recipe-availability.dto';
import { RecipeEstimateDto } from './dto/recipe-estimate.dto';
import {
  CreateRecipeDto,
  RecipeDetailDto,
  RecipeIngredientGroupInputDto,
  RecipeIngredientInputDto,
  RecipeStepInputDto,
  RecipeSummaryDto,
  UpdateRecipeDto,
} from './dto/recipe.dto';
import {
  computeRecipeAvailability,
  convertRecipeQuantityToProductBase,
  recipeUnitToShoppingInputUnit,
  type RecipeIngredientAvailability,
} from './recipe-availability';
import { computeRecipeCost, type ProductPriceInput } from './recipe-cost';
import {
  computeRecipeNutrition,
  type NutritionIngredientInput,
  type ProductNutritionInput,
} from './recipe-nutrition';
import {
  buildPurchaseProposal,
  type PurchaseOptionInput,
} from '../shopping/purchase-proposal';

type RecipeStepWithMedia = RecipeStep & {
  imageMedia?: MediaAsset | null;
};

type RecipeWithRelations = Recipe & {
  author: Pick<User, 'id' | 'name'>;
  ingredientGroups: RecipeIngredientGroup[];
  ingredients: RecipeIngredient[];
  steps: RecipeStepWithMedia[];
  coverMedia?: MediaAsset | null;
};

type StoredGapAdditionResult = AddRecipeGapsResultDto & {
  kitchenId: string;
  includeIngredientIds: string[];
  selections: NormalizedGapSelection[];
  pending?: boolean;
};

type NormalizedGapSelection = {
  ingredientId: string;
  skip: boolean;
  purchaseOptionId: string | null;
  packageCount: number | null;
  exactQuantity: string | null;
};

type GapShoppingCandidate = {
  ingredientId: string;
  ingredientName: string;
  productId: string;
  requiredQuantity: string;
  requiredUnit: 'piece' | 'gram' | 'kilogram' | 'milliliter' | 'liter';
  plannedQuantity: string;
  plannedUnit: 'piece' | 'gram' | 'kilogram' | 'milliliter' | 'liter';
  purchaseOptionId: string | null;
  packageCount: number | null;
};

export type RecipeListFilter = 'all' | 'mine' | 'kitchen';

@Injectable()
export class RecipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shoppingService: ShoppingService,
    private readonly mediaService: MediaService,
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
        coverMedia: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });

    return Promise.all(
      recipes.map(async (recipe) =>
        toRecipeSummaryDto(
          recipe,
          await this.mediaService.buildImageSummary(recipe.coverMedia),
        ),
      ),
    );
  }

  async createRecipe(
    userId: string,
    kitchenId: string,
    dto: CreateRecipeDto,
  ): Promise<RecipeDetailDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const groups = dto.ingredientGroups ?? [];
    validateRecipeStructure(groups, dto.ingredients, dto.steps);
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
          ingredientGroups: {
            create: groups.map((group) => toGroupCreateData(group)),
          },
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

    return this.toRecipeDetailDtoWithMedia(recipe);
  }

  async getRecipe(
    userId: string,
    kitchenId: string,
    recipeId: string,
  ): Promise<RecipeDetailDto> {
    const recipe = await this.findAccessibleRecipe(userId, kitchenId, recipeId);
    return this.toRecipeDetailDtoWithMedia(recipe);
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

    const nextGroups =
      dto.ingredientGroups ??
      existing.ingredientGroups.map(toGroupInputFromEntity);
    const nextIngredients =
      dto.ingredients ?? existing.ingredients.map(toIngredientInputFromEntity);
    const nextSteps = dto.steps ?? existing.steps.map(toStepInputFromEntity);

    const structureTouched =
      dto.ingredientGroups !== undefined ||
      dto.ingredients !== undefined ||
      dto.steps !== undefined;

    if (structureTouched) {
      validateRecipeStructure(nextGroups, nextIngredients, nextSteps);
    }
    if (dto.ingredients !== undefined) {
      await validateIngredientProducts(this.prisma, kitchenId, dto.ingredients);
    }

    const existingStepById = new Map(
      existing.steps.map((step) => [step.id, step]),
    );
    const existingIngredientIds = new Set(
      existing.ingredients.map((ingredient) => ingredient.id),
    );

    let orphanedStepMediaIds: string[] = [];

    const recipe = await this.prisma.$transaction(async (tx) => {
      if (structureTouched) {
        await tx.recipeIngredient.updateMany({
          where: { recipeId },
          data: { groupId: null },
        });
        await tx.recipeIngredient.deleteMany({ where: { recipeId } });
        await tx.recipeIngredientGroup.deleteMany({ where: { recipeId } });
        await tx.recipeStep.deleteMany({ where: { recipeId } });

        const keptStepMediaIds = new Set<string>();
        const stepCreates = nextSteps.map((step) => {
          const previous =
            step.id && existingStepById.has(step.id)
              ? existingStepById.get(step.id)
              : undefined;
          if (previous?.imageMediaId) {
            keptStepMediaIds.add(previous.imageMediaId);
          }
          return {
            ...toStepCreateData(step),
            ...(previous ? { id: previous.id } : {}),
            imageMediaId: previous?.imageMediaId ?? null,
            recipeId,
          };
        });
        orphanedStepMediaIds = existing.steps
          .map((step) => step.imageMediaId)
          .filter(
            (id): id is string => id !== null && !keptStepMediaIds.has(id),
          );

        if (nextGroups.length > 0) {
          await tx.recipeIngredientGroup.createMany({
            data: nextGroups.map((group) => ({
              ...toGroupCreateData(group),
              recipeId,
            })),
          });
        }

        await tx.recipeIngredient.createMany({
          data: nextIngredients.map((ingredient) => {
            const preserveId =
              ingredient.id && existingIngredientIds.has(ingredient.id)
                ? ingredient.id
                : undefined;
            return {
              ...toIngredientCreateData(ingredient),
              ...(preserveId ? { id: preserveId } : {}),
              recipeId,
            };
          }),
        });

        await tx.recipeStep.createMany({ data: stepCreates });
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
        },
        include: recipeInclude,
      });
    });

    if (orphanedStepMediaIds.length > 0) {
      await this.mediaService.deleteAssetsByIds(orphanedStepMediaIds);
    }

    return this.toRecipeDetailDtoWithMedia(recipe);
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

    const mediaAssetIds = [
      existing.coverMediaId,
      ...existing.steps.map((step) => step.imageMediaId),
    ].filter((id): id is string => id !== null);

    await this.prisma.recipe.delete({ where: { id: recipeId } });
    await this.mediaService.deleteAssetsByIds(mediaAssetIds);
  }

  async getEstimate(
    userId: string,
    kitchenId: string,
    recipeId: string,
    servings: number,
  ): Promise<RecipeEstimateDto> {
    if (!Number.isInteger(servings) || servings < 1) {
      throw new BadRequestException('servings musi być liczbą całkowitą >= 1.');
    }

    const recipe = await this.findAccessibleRecipe(userId, kitchenId, recipeId);
    const ingredients: NutritionIngredientInput[] = recipe.ingredients.map(
      (ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        productId: ingredient.productId,
      }),
    );

    const productIds = [
      ...new Set(
        ingredients
          .map((ingredient) => ingredient.productId)
          .filter((productId): productId is string => productId !== null),
      ),
    ];

    const [nutritionByProductId, pricesByProductId] = await Promise.all([
      this.loadNutritionByProductId(kitchenId, productIds),
      this.loadLatestPricesByProductId(kitchenId, productIds),
    ]);

    return {
      servings,
      nutrition: computeRecipeNutrition({
        baseServings: recipe.servings,
        servings,
        ingredients,
        nutritionByProductId,
      }),
      cost: computeRecipeCost({
        baseServings: recipe.servings,
        servings,
        ingredients,
        pricesByProductId,
      }),
    };
  }

  private async loadNutritionByProductId(
    kitchenId: string,
    productIds: string[],
  ): Promise<Map<string, ProductNutritionInput>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.productNutrition.findMany({
      where: {
        productId: { in: productIds },
        product: { kitchenId },
      },
    });
    return new Map(
      rows.map((row) => [
        row.productId,
        {
          baseQuantity: row.baseQuantity,
          baseUnit: row.baseUnit,
          kcal: row.kcal,
          proteinGrams: row.proteinGrams,
          carbsGrams: row.carbsGrams,
          fatGrams: row.fatGrams,
        },
      ]),
    );
  }

  /** Bierzemy najnowszy zakup produktu w tej kuchni (po dacie zakupu). */
  private async loadLatestPricesByProductId(
    kitchenId: string,
    productIds: string[],
  ): Promise<Map<string, ProductPriceInput>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const lineItems = await this.prisma.purchaseLineItem.findMany({
      where: {
        productId: { in: productIds },
        purchase: { kitchenId },
        quantity: { gt: 0 },
      },
      include: {
        purchase: { select: { purchasedAt: true } },
        product: { select: { name: true, defaultUnit: true } },
      },
      orderBy: [{ purchase: { purchasedAt: 'desc' } }],
    });

    const prices = new Map<string, ProductPriceInput>();
    for (const lineItem of lineItems) {
      if (prices.has(lineItem.productId)) {
        continue;
      }
      prices.set(lineItem.productId, {
        productId: lineItem.productId,
        productName: lineItem.product.name,
        purchasedAt: lineItem.purchase.purchasedAt,
        quantity: lineItem.quantity,
        priceMinor: lineItem.priceMinor,
        baseUnit: lineItem.product.defaultUnit,
      });
    }
    return prices;
  }

  private async toRecipeDetailDtoWithMedia(
    recipe: RecipeWithRelations,
  ): Promise<RecipeDetailDto> {
    const coverImage = await this.mediaService.buildImageSummary(
      recipe.coverMedia,
    );
    const stepImages = new Map<string, MediaImageDto | null>();
    for (const step of recipe.steps) {
      stepImages.set(
        step.id,
        await this.mediaService.buildImageSummary(step.imageMedia),
      );
    }
    return toRecipeDetailDto(recipe, coverImage, stepImages);
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
    const normalizedSelections = normalizeGapSelections(dto.selections);

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
        normalizedSelections,
      );
    }

    const recipe = await this.findAccessibleRecipe(userId, kitchenId, recipeId);
    const availability = await this.computeAvailabilityForRecipe(
      recipe,
      kitchenId,
      dto.servings,
    );

    const purchaseOptionsByProductId =
      await this.loadPurchaseOptionsByProductId(kitchenId, availability);

    const { candidates, skipped } = buildGapShoppingCandidates({
      availability: availability.ingredients,
      includeIngredientIds,
      selections: dto.selections,
      purchaseOptionsByProductId,
    });

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
            normalizedSelections,
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
              selections: normalizedSelections,
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
                plannedQuantity: candidate.plannedQuantity,
                plannedUnit: candidate.plannedUnit,
                requiredQuantity: candidate.requiredQuantity,
                requiredUnit: candidate.requiredUnit,
                sourceRecipeId: recipe.id,
                sourceRecipeName: recipe.name,
                purchaseOptionId: candidate.purchaseOptionId ?? undefined,
                packageCount: candidate.packageCount ?? undefined,
                note: `Przepis: ${recipe.name}`,
                mergeQuantity: true,
              },
            );

          added.push({
            ingredientId: candidate.ingredientId,
            ingredientName: candidate.ingredientName,
            productId: candidate.productId,
            quantity: candidate.plannedQuantity,
            unit: candidate.plannedUnit,
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
          selections: normalizedSelections,
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
            normalizedSelections,
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

    const [stockItems, products, purchaseOptions] = await Promise.all([
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
      productIds.length === 0
        ? Promise.resolve([])
        : this.prisma.productPurchaseOption.findMany({
            where: { productId: { in: productIds }, isActive: true },
          }),
    ]);

    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    const purchaseOptionsByProductId = new Map<string, PurchaseOptionInput[]>();
    for (const option of purchaseOptions) {
      const list = purchaseOptionsByProductId.get(option.productId) ?? [];
      list.push({
        id: option.id,
        name: option.name,
        contentQuantity: option.contentQuantity,
        contentUnit: option.contentUnit,
        isDefault: option.isDefault,
        isActive: option.isActive,
      });
      purchaseOptionsByProductId.set(option.productId, list);
    }

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
      purchaseOptionsByProductId,
    });
  }

  private async loadPurchaseOptionsByProductId(
    kitchenId: string,
    availability: RecipeAvailabilityDto,
  ): Promise<Map<string, PurchaseOptionInput[]>> {
    const productIds = [
      ...new Set(
        availability.ingredients
          .map((ingredient) => ingredient.productId)
          .filter((productId): productId is string => productId !== null),
      ),
    ];
    if (productIds.length === 0) {
      return new Map();
    }

    const options = await this.prisma.productPurchaseOption.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        product: { kitchenId },
      },
    });
    const byProductId = new Map<string, PurchaseOptionInput[]>();
    for (const option of options) {
      const list = byProductId.get(option.productId) ?? [];
      list.push({
        id: option.id,
        name: option.name,
        contentQuantity: option.contentQuantity,
        contentUnit: option.contentUnit,
        isDefault: option.isDefault,
        isActive: option.isActive,
      });
      byProductId.set(option.productId, list);
    }
    return byProductId;
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
  ingredientGroups: { orderBy: { sortOrder: 'asc' as const } },
  ingredients: { orderBy: { sortOrder: 'asc' as const } },
  steps: {
    orderBy: { sortOrder: 'asc' as const },
    include: { imageMedia: true },
  },
  coverMedia: true,
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
  groups: RecipeIngredientGroupInputDto[],
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
    groups.map((item) => item.sortOrder),
    'grup składników',
  );
  assertUniqueIds(
    groups.map((item) => item.id),
    'grup składników',
  );
  assertUniqueSortOrders(
    ingredients.map((item) => item.sortOrder),
    'składników',
  );
  assertUniqueSortOrders(
    steps.map((item) => item.sortOrder),
    'kroków',
  );

  const groupIds = new Set(groups.map((group) => group.id));
  for (const ingredient of ingredients) {
    if (ingredient.groupId && !groupIds.has(ingredient.groupId)) {
      throw new BadRequestException(
        'Składnik wskazuje grupę spoza tego przepisu.',
      );
    }
  }
}

function assertUniqueIds(values: string[], label: string): void {
  const unique = new Set(values);
  if (unique.size !== values.length) {
    throw new BadRequestException(
      `Identyfikatory ${label} muszą być unikalne.`,
    );
  }
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

function normalizeGapSelections(
  selections?: RecipeGapSelectionDto[],
): NormalizedGapSelection[] {
  if (!selections) {
    return [];
  }
  return [...selections]
    .map((selection) => ({
      ingredientId: selection.ingredientId,
      skip: selection.skip ?? false,
      purchaseOptionId: selection.purchaseOptionId ?? null,
      packageCount: selection.packageCount ?? null,
      exactQuantity: selection.exactQuantity ?? null,
    }))
    .sort((left, right) => left.ingredientId.localeCompare(right.ingredientId));
}

function sameIncludeIngredientIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((id, index) => id === right[index]);
}

function sameGapSelections(
  left: NormalizedGapSelection[],
  right: NormalizedGapSelection[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const other = right[index];
    return (
      item.ingredientId === other?.ingredientId &&
      item.skip === other.skip &&
      item.purchaseOptionId === other.purchaseOptionId &&
      item.packageCount === other.packageCount &&
      item.exactQuantity === other.exactQuantity
    );
  });
}

function buildGapShoppingCandidates(input: {
  availability: RecipeIngredientAvailability[];
  includeIngredientIds: string[];
  selections?: RecipeGapSelectionDto[];
  purchaseOptionsByProductId: Map<string, PurchaseOptionInput[]>;
}): {
  candidates: GapShoppingCandidate[];
  skipped: SkippedRecipeGapItemDto[];
} {
  const includeSet = new Set(input.includeIngredientIds);
  const selectionByIngredientId = new Map(
    (input.selections ?? []).map((selection) => [
      selection.ingredientId,
      selection,
    ]),
  );
  const useSelections = input.selections !== undefined;

  const candidates: GapShoppingCandidate[] = [];
  const skipped: SkippedRecipeGapItemDto[] = [];

  for (const ingredient of input.availability) {
    const selection = selectionByIngredientId.get(ingredient.ingredientId);

    if (useSelections) {
      if (!selection) {
        continue;
      }
      if (selection.skip) {
        skipped.push({
          ingredientId: ingredient.ingredientId,
          ingredientName: ingredient.name,
          reason: 'skipped',
        });
        continue;
      }
    } else if (ingredient.status === 'available') {
      skipped.push({
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.name,
        reason: 'available',
      });
      continue;
    } else if (ingredient.status === 'unknown') {
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
      (!ingredient.gapQuantity || !ingredient.gapUnit || !ingredient.productId)
    ) {
      skipped.push({
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.name,
        reason: 'not_addable',
      });
      continue;
    }

    if (!ingredient.productId || !ingredient.availableUnit) {
      skipped.push({
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.name,
        reason: 'not_addable',
      });
      continue;
    }

    const requiredUnitSource =
      ingredient.status === 'unknown' ? ingredient.unit : ingredient.gapUnit!;
    const requiredUnit = recipeUnitToShoppingInputUnit(requiredUnitSource);
    if (!requiredUnit) {
      skipped.push({
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.name,
        reason: 'unsupported_unit',
      });
      continue;
    }

    const requiredQuantity =
      ingredient.status === 'unknown'
        ? ingredient.scaledQuantity!
        : ingredient.gapQuantity!;

    const gapInProductBase = gapInProductBaseFromIngredient(
      ingredient,
      ingredient.availableUnit,
    );
    if (gapInProductBase === null) {
      skipped.push({
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.name,
        reason: 'not_addable',
      });
      continue;
    }

    const options =
      input.purchaseOptionsByProductId.get(ingredient.productId) ?? [];
    const purchaseMode =
      ingredient.purchaseMode ?? ProductPurchaseMode.unconfigured;

    if (purchaseMode === ProductPurchaseMode.unconfigured) {
      throw new BadRequestException(PRODUCT_PURCHASE_CONFIG_REQUIRED_MESSAGE);
    }

    if (
      purchaseMode === ProductPurchaseMode.packaged &&
      selection?.exactQuantity &&
      !selection.purchaseOptionId
    ) {
      throw new BadRequestException(
        'Produkt w trybie opakowań wymaga wyboru opcji zakupu (purchaseOptionId i packageCount).',
      );
    }

    let proposal;
    try {
      proposal = buildPurchaseProposal({
        gapInProductBase,
        productUnit: ingredient.availableUnit,
        purchaseMode,
        options,
        preferredOptionId: selection?.purchaseOptionId,
        overridePackageCount: selection?.packageCount,
        exactQuantity: selection?.exactQuantity
          ? parseQuantityString(selection.exactQuantity, 'exactQuantity')
          : null,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Nie udało się zbudować propozycji zakupu.',
      );
    }

    if (purchaseMode === ProductPurchaseMode.packaged) {
      if (!proposal.purchaseOptionId || !proposal.packageCount) {
        throw new BadRequestException(
          'Produkt w trybie opakowań wymaga aktywnej opcji zakupu.',
        );
      }
    }

    candidates.push({
      ingredientId: ingredient.ingredientId,
      ingredientName: ingredient.name,
      productId: ingredient.productId,
      requiredQuantity,
      requiredUnit,
      plannedQuantity: proposal.totalPurchaseQuantity,
      plannedUnit: proposal.totalPurchaseUnit,
      purchaseOptionId:
        purchaseMode === ProductPurchaseMode.packaged
          ? proposal.purchaseOptionId
          : null,
      packageCount:
        purchaseMode === ProductPurchaseMode.packaged
          ? proposal.packageCount
          : null,
    });
  }

  return { candidates, skipped };
}

function gapInProductBaseFromIngredient(
  ingredient: RecipeIngredientAvailability,
  productUnit: ProductUnit,
): Prisma.Decimal | null {
  if (ingredient.gapQuantity && ingredient.gapUnit) {
    return convertRecipeQuantityToProductBase(
      parseQuantityString(ingredient.gapQuantity, 'gapQuantity'),
      ingredient.gapUnit,
      productUnit,
    );
  }
  if (ingredient.status === 'unknown' && ingredient.scaledQuantity) {
    return convertRecipeQuantityToProductBase(
      parseQuantityString(ingredient.scaledQuantity, 'scaledQuantity'),
      ingredient.unit,
      productUnit,
    );
  }
  return null;
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
  selections: NormalizedGapSelection[],
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
  const storedSelections: NormalizedGapSelection[] = Array.isArray(
    stored.selections,
  )
    ? stored.selections
    : [];
  if (!sameGapSelections(storedSelections, selections)) {
    throw new ConflictException('Klucz idempotencji jest już użyty.');
  }

  return toPublicGapResult(stored);
}

function toGroupCreateData(group: RecipeIngredientGroupInputDto) {
  return {
    id: group.id,
    name: group.name.trim(),
    sortOrder: group.sortOrder,
  };
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
    groupId: ingredient.groupId ?? null,
    sortOrder: ingredient.sortOrder,
  };
}

function toStepCreateData(step: RecipeStepInputDto) {
  return {
    title: normalizeOptionalText(step.title),
    instruction: step.instruction.trim(),
    tip: normalizeOptionalText(step.tip),
    durationMinutes: step.durationMinutes ?? null,
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

function toGroupInputFromEntity(
  group: RecipeIngredientGroup,
): RecipeIngredientGroupInputDto {
  return {
    id: group.id,
    name: group.name,
    sortOrder: group.sortOrder,
  };
}

function toIngredientInputFromEntity(
  ingredient: RecipeIngredient,
): RecipeIngredientInputDto {
  return {
    id: ingredient.id,
    groupId: ingredient.groupId,
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
    id: step.id,
    title: step.title,
    instruction: step.instruction,
    tip: step.tip,
    durationMinutes: step.durationMinutes,
    sortOrder: step.sortOrder,
  };
}

function toRecipeSummaryDto(
  recipe: Recipe & { author: Pick<User, 'id' | 'name'> },
  coverImage: MediaImageDto | null,
): RecipeSummaryDto {
  return {
    coverImage,
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

function toRecipeDetailDto(
  recipe: RecipeWithRelations,
  coverImage: MediaImageDto | null,
  stepImages: Map<string, MediaImageDto | null>,
): RecipeDetailDto {
  return {
    ...toRecipeSummaryDto(recipe, coverImage),
    sourceUrl: recipe.sourceUrl,
    ingredientGroups: recipe.ingredientGroups.map((group) => ({
      id: group.id,
      name: group.name,
      sortOrder: group.sortOrder,
    })),
    ingredients: recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      groupId: ingredient.groupId,
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
      title: step.title,
      instruction: step.instruction,
      tip: step.tip,
      durationMinutes: step.durationMinutes,
      sortOrder: step.sortOrder,
      image: stepImages.get(step.id) ?? null,
    })),
  };
}
