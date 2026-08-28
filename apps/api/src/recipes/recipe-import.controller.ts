import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import {
  PreviewRecipeImportDto,
  RecipeImportPreviewDto,
} from './dto/recipe-import.dto';
import { RecipeImportService } from './import/recipe-import.service';

@ApiTags('recipe-import')
@Controller('kitchens/:kitchenId/recipes/import')
export class RecipeImportController {
  constructor(private readonly recipeImportService: RecipeImportService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Pobiera stronę HTTPS i zwraca podgląd przepisu z JSON-LD (bez zapisu).',
  })
  @ApiOkResponse({ type: RecipeImportPreviewDto })
  preview(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Body() body: PreviewRecipeImportDto,
  ): Promise<RecipeImportPreviewDto> {
    return this.recipeImportService.preview(session.user.id, kitchenId, body);
  }
}
