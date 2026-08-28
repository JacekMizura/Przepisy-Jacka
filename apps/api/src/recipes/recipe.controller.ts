import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import {
  AddRecipeGapsDto,
  AddRecipeGapsResultDto,
} from './dto/add-recipe-gaps.dto';
import { RecipeAvailabilityDto } from './dto/recipe-availability.dto';
import { RecipeEstimateDto } from './dto/recipe-estimate.dto';
import {
  CreateRecipeDto,
  RecipeDetailDto,
  RecipeSummaryDto,
  UpdateRecipeDto,
} from './dto/recipe.dto';
import { RecipeService, type RecipeListFilter } from './recipe.service';

@ApiTags('recipes')
@Controller('kitchens/:kitchenId/recipes')
export class RecipeController {
  constructor(private readonly recipeService: RecipeService) {}

  @Get()
  @ApiOperation({ summary: 'Lista przepisów kuchni' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['all', 'mine', 'kitchen'],
  })
  @ApiQuery({
    name: 'categoryIds',
    required: false,
    isArray: true,
    type: String,
    description:
      'Przepisy należące do dowolnej z podanych kategorii (OR). Ignorowane przy uncategorized=true.',
  })
  @ApiQuery({
    name: 'uncategorized',
    required: false,
    type: Boolean,
    description:
      'Wyłącznie przepisy bez kategorii (wyłączne względem categoryIds).',
  })
  @ApiOkResponse({ type: [RecipeSummaryDto] })
  list(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Query('search') search?: string,
    @Query('filter') filter?: RecipeListFilter,
    @Query('categoryIds') categoryIds?: string | string[],
    @Query('uncategorized') uncategorized?: string,
  ): Promise<RecipeSummaryDto[]> {
    return this.recipeService.listRecipes(session.user.id, kitchenId, {
      search,
      filter,
      categoryIds: normalizeCategoryIdsQuery(categoryIds),
      uncategorized: parseBooleanQuery(uncategorized),
    });
  }

  @Post()
  @ApiOperation({ summary: 'Utworzenie przepisu' })
  @ApiOkResponse({ type: RecipeDetailDto })
  create(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Body() body: CreateRecipeDto,
  ): Promise<RecipeDetailDto> {
    return this.recipeService.createRecipe(session.user.id, kitchenId, body);
  }

  @Get(':recipeId')
  @ApiOperation({ summary: 'Szczegóły przepisu' })
  @ApiOkResponse({ type: RecipeDetailDto })
  getOne(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
  ): Promise<RecipeDetailDto> {
    return this.recipeService.getRecipe(session.user.id, kitchenId, recipeId);
  }

  @Patch(':recipeId')
  @ApiOperation({ summary: 'Aktualizacja przepisu (autor)' })
  @ApiOkResponse({ type: RecipeDetailDto })
  update(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
    @Body() body: UpdateRecipeDto,
  ): Promise<RecipeDetailDto> {
    return this.recipeService.updateRecipe(
      session.user.id,
      kitchenId,
      recipeId,
      body,
    );
  }

  @Delete(':recipeId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Usunięcie przepisu (autor)' })
  @ApiNoContentResponse()
  async remove(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
  ): Promise<void> {
    await this.recipeService.deleteRecipe(session.user.id, kitchenId, recipeId);
  }

  @Get(':recipeId/availability')
  @ApiOperation({ summary: 'Dostępność składników dla liczby porcji' })
  @ApiQuery({ name: 'servings', required: true, type: Number })
  @ApiOkResponse({ type: RecipeAvailabilityDto })
  availability(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
    @Query('servings', ParseIntPipe) servings: number,
  ): Promise<RecipeAvailabilityDto> {
    return this.recipeService.getAvailability(
      session.user.id,
      kitchenId,
      recipeId,
      servings,
    );
  }

  @Get(':recipeId/estimate')
  @ApiOperation({
    summary: 'Szacunkowe kalorie, makroskładniki i koszt przepisu',
  })
  @ApiQuery({ name: 'servings', required: true, type: Number })
  @ApiOkResponse({ type: RecipeEstimateDto })
  estimate(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
    @Query('servings', ParseIntPipe) servings: number,
  ): Promise<RecipeEstimateDto> {
    return this.recipeService.getEstimate(
      session.user.id,
      kitchenId,
      recipeId,
      servings,
    );
  }

  @Post(':recipeId/add-gaps-to-shopping-list')
  @ApiOperation({ summary: 'Dodanie brakujących składników do listy zakupów' })
  @ApiOkResponse({ type: AddRecipeGapsResultDto })
  addGapsToShoppingList(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
    @Body() body: AddRecipeGapsDto,
  ): Promise<AddRecipeGapsResultDto> {
    return this.recipeService.addGapsToShoppingList(
      session.user.id,
      kitchenId,
      recipeId,
      body,
    );
  }
}

function normalizeCategoryIdsQuery(
  value: string | string[] | undefined,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : value.split(',');
  const ids = raw
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return ids.length > 0 ? [...new Set(ids)] : undefined;
}

function parseBooleanQuery(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}
