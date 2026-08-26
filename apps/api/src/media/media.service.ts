import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppEnv } from '../config/env';
import {
  MediaPurpose,
  MediaUploadStatus,
  Prisma,
  RecipeVisibility,
  type MediaAsset,
} from '../generated/prisma/client';
import { requireKitchenMember } from '../kitchens/kitchen-access';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttachedMediaDto,
  BeginMediaUploadDto,
  BeginMediaUploadResultDto,
  MediaAssetDto,
  MediaImageDto,
} from './dto/media.dto';
import {
  PROCESSED_MIME_TYPE,
  processMediaImage,
  sniffImageKind,
} from './image-processing';
import {
  MEDIA_INVALID_IMAGE_MESSAGE,
  MEDIA_NOT_FOUND_MESSAGE,
  MEDIA_NOT_READY_MESSAGE,
  MEDIA_STORAGE_NOT_CONFIGURED_MESSAGE,
  MEDIA_UPLOAD_MISSING_MESSAGE,
} from './media.messages';
import { MEDIA_STORAGE, type MediaStorage } from './storage/media-storage';

const UPLOAD_URL_TTL_SECONDS = 900;
const DOWNLOAD_URL_TTL_SECONDS = 900;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  isMemoryDriver(): boolean {
    return (
      this.config.get('MEDIA_STORAGE_DRIVER', { infer: true }) === 'memory'
    );
  }

  async beginUpload(
    userId: string,
    kitchenId: string,
    dto: BeginMediaUploadDto,
  ): Promise<BeginMediaUploadResultDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    this.assertStorageConfigured();

    const maxBytes = this.config.get('MEDIA_MAX_UPLOAD_BYTES', { infer: true });
    if (dto.declaredByteSize > maxBytes) {
      throw new BadRequestException(
        `Zdjęcie może mieć maksymalnie ${maxBytes} bajtów.`,
      );
    }

    await this.assertUploadTarget(userId, kitchenId, dto);

    const objectKey = `kitchens/${kitchenId}/tmp/${randomUUID()}`;
    const asset = await this.prisma.mediaAsset.create({
      data: {
        kitchenId,
        uploadedByUserId: userId,
        purpose: dto.purpose,
        objectKey,
        mimeType: dto.declaredMimeType,
        byteSize: dto.declaredByteSize,
        status: MediaUploadStatus.pending,
      },
    });

    const uploadUrl = this.isMemoryDriver()
      ? `/api/kitchens/${kitchenId}/media/${asset.id}/memory-upload`
      : await this.storage.createPresignedPutUrl(
          objectKey,
          dto.declaredMimeType,
          UPLOAD_URL_TTL_SECONDS,
        );

    return {
      mediaAssetId: asset.id,
      uploadUrl,
      objectKey,
      expiresAt: new Date(
        Date.now() + UPLOAD_URL_TTL_SECONDS * 1000,
      ).toISOString(),
      headers: { 'Content-Type': dto.declaredMimeType },
    };
  }

  /** Zastępuje wysyłkę na podpisany URL w testach (`MEDIA_STORAGE_DRIVER=memory`). */
  async uploadToMemoryStorage(
    userId: string,
    kitchenId: string,
    mediaAssetId: string,
    contentBase64: string,
  ): Promise<void> {
    if (!this.isMemoryDriver()) {
      throw new NotFoundException(MEDIA_NOT_FOUND_MESSAGE);
    }
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const asset = await this.findKitchenAsset(kitchenId, mediaAssetId);
    this.assertUploader(asset, userId);
    await this.storage.putObject(
      asset.objectKey,
      Buffer.from(contentBase64, 'base64'),
      asset.mimeType,
    );
  }

  async completeUpload(
    userId: string,
    kitchenId: string,
    mediaAssetId: string,
  ): Promise<MediaAssetDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    this.assertStorageConfigured();

    const asset = await this.findKitchenAsset(kitchenId, mediaAssetId);
    this.assertUploader(asset, userId);
    if (asset.status === MediaUploadStatus.ready) {
      return this.toMediaAssetDto(asset);
    }

    const maxBytes = this.config.get('MEDIA_MAX_UPLOAD_BYTES', { infer: true });
    const temporaryKey = asset.objectKey;

    const head = await this.storage.headObject(temporaryKey);
    if (!head) {
      throw new BadRequestException(MEDIA_UPLOAD_MISSING_MESSAGE);
    }
    if (head.contentLength > maxBytes) {
      await this.safeDeleteObject(temporaryKey);
      await this.markFailed(asset.id);
      throw new BadRequestException(
        `Zdjęcie może mieć maksymalnie ${maxBytes} bajtów.`,
      );
    }

    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: MediaUploadStatus.processing },
    });

    try {
      const original = await this.storage.getObject(temporaryKey);
      if (original.byteLength > maxBytes) {
        throw new BadRequestException(
          `Zdjęcie może mieć maksymalnie ${maxBytes} bajtów.`,
        );
      }
      if (sniffImageKind(original) === null) {
        throw new BadRequestException(MEDIA_INVALID_IMAGE_MESSAGE);
      }

      const processed = await processMediaImage(original, asset.purpose);
      const finalKey = `kitchens/${kitchenId}/${asset.purpose}/${asset.id}.webp`;
      const thumbnailKey = `kitchens/${kitchenId}/${asset.purpose}/${asset.id}.thumb.webp`;

      await this.storage.putObject(
        finalKey,
        processed.main.data,
        PROCESSED_MIME_TYPE,
      );
      await this.storage.putObject(
        thumbnailKey,
        processed.thumbnail.data,
        PROCESSED_MIME_TYPE,
      );
      await this.safeDeleteObject(temporaryKey);

      const updated = await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          objectKey: finalKey,
          thumbnailObjectKey: thumbnailKey,
          mimeType: PROCESSED_MIME_TYPE,
          byteSize: processed.main.byteSize,
          width: processed.main.width,
          height: processed.main.height,
          status: MediaUploadStatus.ready,
        },
      });
      return this.toMediaAssetDto(updated);
    } catch (error) {
      await this.markFailed(asset.id);
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Nie udało się przetworzyć zdjęcia ${asset.id}: ${String(error)}`,
      );
      throw new BadRequestException(MEDIA_INVALID_IMAGE_MESSAGE);
    }
  }

  async deleteAsset(
    userId: string,
    kitchenId: string,
    mediaAssetId: string,
  ): Promise<void> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const asset = await this.findKitchenAsset(kitchenId, mediaAssetId);
    await this.assertCanMutateAsset(userId, asset);
    await this.removeAsset(asset);
  }

  async attachProductImage(
    userId: string,
    kitchenId: string,
    productId: string,
    mediaAssetId: string,
  ): Promise<AttachedMediaDto> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, kitchenId },
    });
    if (!product) {
      throw new NotFoundException('Nie znaleziono produktu w tej kuchni.');
    }
    const asset = await this.requireAttachableAsset(
      kitchenId,
      mediaAssetId,
      MediaPurpose.product,
    );

    const updated = await this.replaceAttachment(
      product.imageMediaId,
      asset.id,
      () =>
        this.prisma.product.update({
          where: { id: product.id },
          data: { imageMediaId: asset.id },
          include: { imageMedia: true },
        }),
    );

    return {
      targetId: product.id,
      image: await this.buildImageSummary(updated.imageMedia),
    };
  }

  async detachProductImage(
    userId: string,
    kitchenId: string,
    productId: string,
  ): Promise<void> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, kitchenId },
    });
    if (!product) {
      throw new NotFoundException('Nie znaleziono produktu w tej kuchni.');
    }
    if (!product.imageMediaId) {
      return;
    }
    const previousId = product.imageMediaId;
    await this.prisma.product.update({
      where: { id: product.id },
      data: { imageMediaId: null },
    });
    await this.deleteAssetIfOrphan(previousId);
  }

  async attachRecipeCover(
    userId: string,
    kitchenId: string,
    recipeId: string,
    mediaAssetId: string,
  ): Promise<AttachedMediaDto> {
    const recipe = await this.requireRecipeAuthor(userId, kitchenId, recipeId);
    const asset = await this.requireAttachableAsset(
      kitchenId,
      mediaAssetId,
      MediaPurpose.recipe_cover,
    );

    const updated = await this.replaceAttachment(
      recipe.coverMediaId,
      asset.id,
      () =>
        this.prisma.recipe.update({
          where: { id: recipe.id },
          data: { coverMediaId: asset.id },
          include: { coverMedia: true },
        }),
    );

    return {
      targetId: recipe.id,
      image: await this.buildImageSummary(updated.coverMedia),
    };
  }

  async detachRecipeCover(
    userId: string,
    kitchenId: string,
    recipeId: string,
  ): Promise<void> {
    const recipe = await this.requireRecipeAuthor(userId, kitchenId, recipeId);
    if (!recipe.coverMediaId) {
      return;
    }
    const previousId = recipe.coverMediaId;
    await this.prisma.recipe.update({
      where: { id: recipe.id },
      data: { coverMediaId: null },
    });
    await this.deleteAssetIfOrphan(previousId);
  }

  async attachRecipeStepImage(
    userId: string,
    kitchenId: string,
    recipeId: string,
    stepId: string,
    mediaAssetId: string,
  ): Promise<AttachedMediaDto> {
    const recipe = await this.requireRecipeAuthor(userId, kitchenId, recipeId);
    const step = await this.prisma.recipeStep.findFirst({
      where: { id: stepId, recipeId: recipe.id },
    });
    if (!step) {
      throw new NotFoundException('Nie znaleziono kroku przepisu.');
    }
    const asset = await this.requireAttachableAsset(
      kitchenId,
      mediaAssetId,
      MediaPurpose.recipe_step,
    );

    const updated = await this.replaceAttachment(
      step.imageMediaId,
      asset.id,
      () =>
        this.prisma.recipeStep.update({
          where: { id: step.id },
          data: { imageMediaId: asset.id },
          include: { imageMedia: true },
        }),
    );

    return {
      targetId: step.id,
      image: await this.buildImageSummary(updated.imageMedia),
    };
  }

  async detachRecipeStepImage(
    userId: string,
    kitchenId: string,
    recipeId: string,
    stepId: string,
  ): Promise<void> {
    const recipe = await this.requireRecipeAuthor(userId, kitchenId, recipeId);
    const step = await this.prisma.recipeStep.findFirst({
      where: { id: stepId, recipeId: recipe.id },
    });
    if (!step) {
      throw new NotFoundException('Nie znaleziono kroku przepisu.');
    }
    if (!step.imageMediaId) {
      return;
    }
    const previousId = step.imageMediaId;
    await this.prisma.recipeStep.update({
      where: { id: step.id },
      data: { imageMediaId: null },
    });
    await this.deleteAssetIfOrphan(previousId);
  }

  /** Podpisany URL powstaje na żądanie i nigdy nie trafia do bazy. */
  async buildImageSummary(
    asset: MediaAsset | null | undefined,
  ): Promise<MediaImageDto | null> {
    if (
      !asset ||
      asset.status !== MediaUploadStatus.ready ||
      !this.storage.isConfigured()
    ) {
      return null;
    }
    try {
      const [url, thumbnailUrl] = await Promise.all([
        this.storage.createPresignedGetUrl(
          asset.objectKey,
          DOWNLOAD_URL_TTL_SECONDS,
        ),
        asset.thumbnailObjectKey
          ? this.storage.createPresignedGetUrl(
              asset.thumbnailObjectKey,
              DOWNLOAD_URL_TTL_SECONDS,
            )
          : Promise.resolve(null),
      ]);
      return { mediaAssetId: asset.id, url, thumbnailUrl };
    } catch (error) {
      this.logger.warn(
        `Nie udało się podpisać URL zdjęcia ${asset.id}: ${String(error)}`,
      );
      return null;
    }
  }

  async buildImageSummaries(
    assets: Array<MediaAsset | null | undefined>,
  ): Promise<Map<string, MediaImageDto>> {
    const summaries = new Map<string, MediaImageDto>();
    for (const asset of assets) {
      const summary = await this.buildImageSummary(asset);
      if (summary) {
        summaries.set(summary.mediaAssetId, summary);
      }
    }
    return summaries;
  }

  /** Usuwa zdjęcia po skasowaniu właściciela (np. przepisu). */
  async deleteAssetsByIds(ids: string[]): Promise<void> {
    const unique = [...new Set(ids.filter((id) => id.length > 0))];
    if (unique.length === 0) {
      return;
    }
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: unique } },
    });
    for (const asset of assets) {
      await this.removeAsset(asset);
    }
  }

  async toMediaAssetDto(asset: MediaAsset): Promise<MediaAssetDto> {
    return {
      id: asset.id,
      kitchenId: asset.kitchenId,
      purpose: asset.purpose,
      status: asset.status,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      image: await this.buildImageSummary(asset),
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }

  private async replaceAttachment<T>(
    previousAssetId: string | null,
    nextAssetId: string,
    update: () => Promise<T>,
  ): Promise<T> {
    let updated: T;
    try {
      updated = await update();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'To zdjęcie jest już przypisane do innego elementu.',
        );
      }
      throw error;
    }
    if (previousAssetId && previousAssetId !== nextAssetId) {
      await this.deleteAssetIfOrphan(previousAssetId);
    }
    return updated;
  }

  private async requireAttachableAsset(
    kitchenId: string,
    mediaAssetId: string,
    purpose: MediaPurpose,
  ): Promise<MediaAsset> {
    const asset = await this.findKitchenAsset(kitchenId, mediaAssetId);
    if (asset.purpose !== purpose) {
      throw new BadRequestException(
        'Zdjęcie zostało utworzone dla innego przeznaczenia.',
      );
    }
    if (asset.status !== MediaUploadStatus.ready) {
      throw new BadRequestException(MEDIA_NOT_READY_MESSAGE);
    }
    return asset;
  }

  private async findKitchenAsset(
    kitchenId: string,
    mediaAssetId: string,
  ): Promise<MediaAsset> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaAssetId, kitchenId },
    });
    if (!asset) {
      throw new NotFoundException(MEDIA_NOT_FOUND_MESSAGE);
    }
    return asset;
  }

  private assertUploader(asset: MediaAsset, userId: string): void {
    if (asset.uploadedByUserId !== userId) {
      throw new ForbiddenException(
        'Tę operację może wykonać wyłącznie osoba, która rozpoczęła wysyłkę.',
      );
    }
  }

  private async assertCanMutateAsset(
    userId: string,
    asset: MediaAsset,
  ): Promise<void> {
    if (asset.purpose === MediaPurpose.product) {
      return;
    }
    const recipe = await this.findRecipeForAsset(asset);
    if (!recipe) {
      this.assertUploader(asset, userId);
      return;
    }
    if (recipe.authorUserId !== userId) {
      throw new ForbiddenException(
        'Tę operację może wykonać wyłącznie autor przepisu.',
      );
    }
  }

  private async findRecipeForAsset(
    asset: MediaAsset,
  ): Promise<{ id: string; authorUserId: string } | null> {
    if (asset.purpose === MediaPurpose.recipe_cover) {
      return this.prisma.recipe.findFirst({
        where: { coverMediaId: asset.id },
        select: { id: true, authorUserId: true },
      });
    }
    if (asset.purpose === MediaPurpose.recipe_step) {
      const step = await this.prisma.recipeStep.findFirst({
        where: { imageMediaId: asset.id },
        select: { recipe: { select: { id: true, authorUserId: true } } },
      });
      return step?.recipe ?? null;
    }
    return null;
  }

  private async assertUploadTarget(
    userId: string,
    kitchenId: string,
    dto: BeginMediaUploadDto,
  ): Promise<void> {
    const target = dto.target;
    const provided = [
      target?.productId,
      target?.recipeId,
      target?.recipeStepId,
    ].filter((value) => value !== undefined);
    if (provided.length > 1) {
      throw new BadRequestException(
        'target może wskazywać tylko jeden element.',
      );
    }

    if (dto.purpose === MediaPurpose.product) {
      if (target?.recipeId || target?.recipeStepId) {
        throw new BadRequestException(
          'Zdjęcie produktu wymaga target.productId.',
        );
      }
      if (target?.productId) {
        const product = await this.prisma.product.findFirst({
          where: { id: target.productId, kitchenId },
          select: { id: true },
        });
        if (!product) {
          throw new NotFoundException('Nie znaleziono produktu w tej kuchni.');
        }
      }
      return;
    }

    if (dto.purpose === MediaPurpose.recipe_cover) {
      if (!target?.recipeId) {
        throw new BadRequestException(
          'Okładka przepisu wymaga target.recipeId.',
        );
      }
      await this.requireRecipeAuthor(userId, kitchenId, target.recipeId);
      return;
    }

    if (!target?.recipeStepId) {
      throw new BadRequestException(
        'Zdjęcie kroku wymaga target.recipeStepId.',
      );
    }
    const step = await this.prisma.recipeStep.findFirst({
      where: { id: target.recipeStepId, recipe: { kitchenId } },
      select: { recipe: { select: { id: true, authorUserId: true } } },
    });
    if (!step) {
      throw new NotFoundException('Nie znaleziono kroku przepisu.');
    }
    if (step.recipe.authorUserId !== userId) {
      throw new ForbiddenException(
        'Tę operację może wykonać wyłącznie autor przepisu.',
      );
    }
  }

  private async requireRecipeAuthor(
    userId: string,
    kitchenId: string,
    recipeId: string,
  ): Promise<{
    id: string;
    authorUserId: string;
    coverMediaId: string | null;
  }> {
    await requireKitchenMember(this.prisma, kitchenId, userId);
    const recipe = await this.prisma.recipe.findFirst({
      where: { id: recipeId, kitchenId },
      select: {
        id: true,
        authorUserId: true,
        coverMediaId: true,
        visibility: true,
      },
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
    if (recipe.authorUserId !== userId) {
      throw new ForbiddenException(
        'Tę operację może wykonać wyłącznie autor przepisu.',
      );
    }
    return {
      id: recipe.id,
      authorUserId: recipe.authorUserId,
      coverMediaId: recipe.coverMediaId,
    };
  }

  private async deleteAssetIfOrphan(assetId: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: {
        product: { select: { id: true } },
        recipeCover: { select: { id: true } },
        recipeStep: { select: { id: true } },
      },
    });
    if (!asset) {
      return;
    }
    if (asset.product || asset.recipeCover || asset.recipeStep) {
      return;
    }
    await this.removeAsset(asset);
  }

  private async removeAsset(asset: MediaAsset): Promise<void> {
    await this.safeDeleteObject(asset.objectKey);
    if (asset.thumbnailObjectKey) {
      await this.safeDeleteObject(asset.thumbnailObjectKey);
    }
    await this.prisma.mediaAsset.delete({ where: { id: asset.id } });
  }

  private async markFailed(assetId: string): Promise<void> {
    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: { status: MediaUploadStatus.failed },
    });
  }

  private async safeDeleteObject(key: string): Promise<void> {
    if (!this.storage.isConfigured()) {
      return;
    }
    try {
      await this.storage.deleteObject(key);
    } catch (error) {
      this.logger.warn(`Nie udało się usunąć obiektu ${key}: ${String(error)}`);
    }
  }

  private assertStorageConfigured(): void {
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        MEDIA_STORAGE_NOT_CONFIGURED_MESSAGE,
      );
    }
  }
}
