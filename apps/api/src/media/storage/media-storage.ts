export const MEDIA_STORAGE = 'MEDIA_STORAGE';

export type MediaObjectHead = {
  contentLength: number;
  contentType?: string;
};

/**
 * Warstwa obiektowa dla zdjęć. Klucz (`key`) jest ścieżką w buckecie,
 * nigdy nie zawiera podpisu ani domeny.
 */
export interface MediaStorage {
  isConfigured(): boolean;
  createPresignedPutUrl(
    key: string,
    contentType: string,
    expiresSeconds: number,
  ): Promise<string>;
  createPresignedGetUrl(key: string, expiresSeconds: number): Promise<string>;
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<MediaObjectHead | null>;
}
