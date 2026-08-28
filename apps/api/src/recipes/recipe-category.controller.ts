import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import {
  CreateRecipeCategoryDto,
  RecipeCategoryDto,
  UpdateRecipeCategoryDto,
} from './dto/recipe-category.dto';
import { RecipeCategoryService } from './recipe-category.service';

@ApiTags('recipe-categories')
@Controller('kitchens/:kitchenId/recipe-categories')
export class RecipeCategoryController {
  constructor(private readonly recipeCategoryService: RecipeCategoryService) {}

  @Get()
  @ApiOperation({ summary: 'Lista kategorii przepisów kuchni' })
  @ApiOkResponse({ type: [RecipeCategoryDto] })
  list(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
  ): Promise<RecipeCategoryDto[]> {
    return this.recipeCategoryService.list(session.user.id, kitchenId);
  }

  @Post()
  @ApiOperation({ summary: 'Utworzenie kategorii przepisów' })
  @ApiOkResponse({ type: RecipeCategoryDto })
  create(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Body() body: CreateRecipeCategoryDto,
  ): Promise<RecipeCategoryDto> {
    return this.recipeCategoryService.create(session.user.id, kitchenId, body);
  }

  @Patch(':categoryId')
  @ApiOperation({ summary: 'Zmiana nazwy kategorii przepisów' })
  @ApiOkResponse({ type: RecipeCategoryDto })
  update(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() body: UpdateRecipeCategoryDto,
  ): Promise<RecipeCategoryDto> {
    return this.recipeCategoryService.update(
      session.user.id,
      kitchenId,
      categoryId,
      body,
    );
  }

  @Delete(':categoryId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Usunięcie kategorii (usuwa tylko przypisania, nie przepisy)',
  })
  @ApiNoContentResponse()
  async remove(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<void> {
    await this.recipeCategoryService.remove(
      session.user.id,
      kitchenId,
      categoryId,
    );
  }
}
