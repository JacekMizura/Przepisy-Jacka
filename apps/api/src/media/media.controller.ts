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

import {
  BeginMediaUploadDto,
  BeginMediaUploadResultDto,
  MediaAssetDto,
  MemoryUploadDto,
} from './dto/media.dto';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller('kitchens/:kitchenId/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('uploads')
  @ApiOperation({ summary: 'Rozpoczęcie wysyłki zdjęcia' })
  @ApiOkResponse({ type: BeginMediaUploadResultDto })
  beginUpload(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Body() body: BeginMediaUploadDto,
  ): Promise<BeginMediaUploadResultDto> {
    return this.mediaService.beginUpload(session.user.id, kitchenId, body);
  }

  @Post(':mediaAssetId/memory-upload')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Wysyłka zawartości do magazynu w pamięci (tylko MEDIA_STORAGE_DRIVER=memory)',
  })
  @ApiNoContentResponse()
  async memoryUpload(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('mediaAssetId', ParseUUIDPipe) mediaAssetId: string,
    @Body() body: MemoryUploadDto,
  ): Promise<void> {
    await this.mediaService.uploadToMemoryStorage(
      session.user.id,
      kitchenId,
      mediaAssetId,
      body.contentBase64,
    );
  }

  @Post(':mediaAssetId/complete')
  @ApiOperation({ summary: 'Zakończenie wysyłki i przetworzenie zdjęcia' })
  @ApiOkResponse({ type: MediaAssetDto })
  completeUpload(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('mediaAssetId', ParseUUIDPipe) mediaAssetId: string,
  ): Promise<MediaAssetDto> {
    return this.mediaService.completeUpload(
      session.user.id,
      kitchenId,
      mediaAssetId,
    );
  }

  @Delete(':mediaAssetId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Usunięcie zdjęcia wraz z plikami' })
  @ApiNoContentResponse()
  async deleteAsset(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('mediaAssetId', ParseUUIDPipe) mediaAssetId: string,
  ): Promise<void> {
    await this.mediaService.deleteAsset(
      session.user.id,
      kitchenId,
      mediaAssetId,
    );
  }
}
