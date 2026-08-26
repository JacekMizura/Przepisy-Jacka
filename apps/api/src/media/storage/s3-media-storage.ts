import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ServiceUnavailableException } from '@nestjs/common';

import { isMediaStorageConfigured, type AppEnv } from '../../config/env';
import { MEDIA_STORAGE_NOT_CONFIGURED_MESSAGE } from '../media.messages';
import type { MediaObjectHead, MediaStorage } from './media-storage';

type S3Env = Pick<
  AppEnv,
  | 'MEDIA_S3_ENDPOINT'
  | 'MEDIA_S3_REGION'
  | 'MEDIA_S3_BUCKET'
  | 'MEDIA_S3_ACCESS_KEY_ID'
  | 'MEDIA_S3_SECRET_ACCESS_KEY'
>;

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export class S3MediaStorage implements MediaStorage {
  private readonly bucket?: string;
  private readonly client?: S3Client;

  constructor(env: S3Env) {
    if (!isMediaStorageConfigured(env)) {
      return;
    }
    this.bucket = env.MEDIA_S3_BUCKET;
    this.client = new S3Client({
      region: env.MEDIA_S3_REGION,
      endpoint: env.MEDIA_S3_ENDPOINT,
      // Railway i inne S3-kompatybilne magazyny nie obsługują virtual-hosted style.
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.MEDIA_S3_ACCESS_KEY_ID!,
        secretAccessKey: env.MEDIA_S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  isConfigured(): boolean {
    return this.client !== undefined && this.bucket !== undefined;
  }

  async createPresignedPutUrl(
    key: string,
    contentType: string,
    expiresSeconds: number,
  ): Promise<string> {
    const { client, bucket } = this.requireClient();
    return getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: expiresSeconds },
    );
  }

  async createPresignedGetUrl(
    key: string,
    expiresSeconds: number,
  ): Promise<string> {
    const { client, bucket } = this.requireClient();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expiresSeconds },
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const { client, bucket } = this.requireClient();
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error(`Brak zawartości obiektu: ${key}`);
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const { client, bucket } = this.requireClient();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    const { client, bucket } = this.requireClient();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async headObject(key: string): Promise<MediaObjectHead | null> {
    const { client, bucket } = this.requireClient();
    try {
      const response = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType,
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private requireClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException(
        MEDIA_STORAGE_NOT_CONFIGURED_MESSAGE,
      );
    }
    return { client: this.client, bucket: this.bucket };
  }
}
