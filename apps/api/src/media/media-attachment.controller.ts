import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
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

import { AttachedMediaDto, AttachMediaDto } from './dto/media.dto';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller('kitchens/:kitchenId')
export class MediaAttachmentController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('products/:productId/image')
  @ApiOperation({ summary: 'Przypisanie zdjęcia do produktu' })
  @ApiOkResponse({ type: AttachedMediaDto })
  attachProductImage(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: AttachMediaDto,
  ): Promise<AttachedMediaDto> {
    return this.mediaService.attachProductImage(
      session.user.id,
      kitchenId,
      productId,
      body.mediaAssetId,
    );
  }

  @Delete('products/:productId/image')
  @HttpCode(204)
  @ApiOperation({ summary: 'Odpięcie zdjęcia produktu' })
  @ApiNoContentResponse()
  async detachProductImage(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<void> {
    await this.mediaService.detachProductImage(
      session.user.id,
      kitchenId,
      productId,
    );
  }

  @Post('recipes/:recipeId/cover')
  @ApiOperation({ summary: 'Przypisanie okładki przepisu (autor)' })
  @ApiOkResponse({ type: AttachedMediaDto })
  attachRecipeCover(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
    @Body() body: AttachMediaDto,
  ): Promise<AttachedMediaDto> {
    return this.mediaService.attachRecipeCover(
      session.user.id,
      kitchenId,
      recipeId,
      body.mediaAssetId,
    );
  }

  @Delete('recipes/:recipeId/cover')
  @HttpCode(204)
  @ApiOperation({ summary: 'Odpięcie okładki przepisu (autor)' })
  @ApiNoContentResponse()
  async detachRecipeCover(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
  ): Promise<void> {
    await this.mediaService.detachRecipeCover(
      session.user.id,
      kitchenId,
      recipeId,
    );
  }

  @Post('recipes/:recipeId/steps/:stepId/image')
  @ApiOperation({ summary: 'Przypisanie zdjęcia do kroku przepisu (autor)' })
  @ApiOkResponse({ type: AttachedMediaDto })
  attachRecipeStepImage(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() body: AttachMediaDto,
  ): Promise<AttachedMediaDto> {
    return this.mediaService.attachRecipeStepImage(
      session.user.id,
      kitchenId,
      recipeId,
      stepId,
      body.mediaAssetId,
    );
  }

  @Delete('recipes/:recipeId/steps/:stepId/image')
  @HttpCode(204)
  @ApiOperation({ summary: 'Odpięcie zdjęcia kroku przepisu (autor)' })
  @ApiNoContentResponse()
  async detachRecipeStepImage(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
  ): Promise<void> {
    await this.mediaService.detachRecipeStepImage(
      session.user.id,
      kitchenId,
      recipeId,
      stepId,
    );
  }
}
