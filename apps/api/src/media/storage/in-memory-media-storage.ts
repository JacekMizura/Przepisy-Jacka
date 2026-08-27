import { Injectable } from '@nestjs/common';

import type { MediaObjectHead, MediaStorage } from './media-storage';

type StoredObject = {
  body: Buffer;
  contentType: string;
};

/**
 * Magazyn w pamięci procesu. Używany w testach e2e
 * (`MEDIA_STORAGE_DRIVER=memory`), nigdy w produkcji.
 */
@Injectable()
export class InMemoryMediaStorage implements MediaStorage {
  private readonly objects = new Map<string, StoredObject>();

  isConfigured(): boolean {
    return true;
  }

  createPresignedPutUrl(key: string): Promise<string> {
    return Promise.resolve(`memory://put/${encodeURI(key)}`);
  }

  createPresignedGetUrl(key: string): Promise<string> {
    const object = this.objects.get(key);
    if (!object) {
      return Promise.resolve(`memory://missing/${encodeURI(key)}`);
    }
    // Local/test only: return a data URL so browsers can render without S3.
    return Promise.resolve(
      `data:${object.contentType};base64,${object.body.toString('base64')}`,
    );
  }

  getObject(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) {
      return Promise.reject(new Error(`Brak obiektu w magazynie: ${key}`));
    }
    return Promise.resolve(object.body);
  }

  putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), contentType });
    return Promise.resolve();
  }

  deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  headObject(key: string): Promise<MediaObjectHead | null> {
    const object = this.objects.get(key);
    if (!object) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      contentLength: object.body.byteLength,
      contentType: object.contentType,
    });
  }
}
