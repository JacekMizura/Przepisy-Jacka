import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppEnv } from '../config/env';
import { MediaAttachmentController } from './media-attachment.controller';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { InMemoryMediaStorage } from './storage/in-memory-media-storage';
import { MEDIA_STORAGE, type MediaStorage } from './storage/media-storage';
import { S3MediaStorage } from './storage/s3-media-storage';

export function createMediaStorage(
  config: ConfigService<AppEnv, true>,
): MediaStorage {
  if (config.get('MEDIA_STORAGE_DRIVER', { infer: true }) === 'memory') {
    if (config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'MEDIA_STORAGE_DRIVER=memory jest dostępny wyłącznie poza produkcją.',
      );
    }
    return new InMemoryMediaStorage();
  }
  return new S3MediaStorage({
    MEDIA_S3_ENDPOINT: config.get('MEDIA_S3_ENDPOINT', { infer: true }),
    MEDIA_S3_REGION: config.get('MEDIA_S3_REGION', { infer: true }),
    MEDIA_S3_BUCKET: config.get('MEDIA_S3_BUCKET', { infer: true }),
    MEDIA_S3_ACCESS_KEY_ID: config.get('MEDIA_S3_ACCESS_KEY_ID', {
      infer: true,
    }),
    MEDIA_S3_SECRET_ACCESS_KEY: config.get('MEDIA_S3_SECRET_ACCESS_KEY', {
      infer: true,
    }),
  });
}

@Module({
  controllers: [MediaController, MediaAttachmentController],
  providers: [
    {
      provide: MEDIA_STORAGE,
      inject: [ConfigService],
      useFactory: createMediaStorage,
    },
    MediaService,
  ],
  exports: [MediaService],
})
export class MediaModule {}
