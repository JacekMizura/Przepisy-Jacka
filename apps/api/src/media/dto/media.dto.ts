import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBase64,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

import { MediaPurpose, MediaUploadStatus } from '../../generated/prisma/client';
import { ALLOWED_UPLOAD_MIME_TYPES } from '../image-processing';

export class MediaUploadTargetDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  recipeId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  recipeStepId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  purchaseId?: string;
}

export class BeginMediaUploadDto {
  @ApiProperty({ enum: MediaPurpose })
  @IsEnum(MediaPurpose)
  purpose!: MediaPurpose;

  @ApiProperty({
    enum: ALLOWED_UPLOAD_MIME_TYPES,
    example: 'image/jpeg',
    description:
      'Deklarowany typ pliku. Zawartość jest weryfikowana po bajtach.',
  })
  @IsString()
  @IsIn(ALLOWED_UPLOAD_MIME_TYPES, {
    message: 'declaredMimeType musi być image/jpeg, image/png albo image/webp.',
  })
  declaredMimeType!: string;

  @ApiProperty({ example: 512_000 })
  @IsInt()
  @Min(1)
  declaredByteSize!: number;

  @ApiPropertyOptional({ type: MediaUploadTargetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MediaUploadTargetDto)
  target?: MediaUploadTargetDto;
}

export class BeginMediaUploadHeadersDto {
  @ApiProperty({ name: 'Content-Type', example: 'image/jpeg' })
  'Content-Type'!: string;
}

export class BeginMediaUploadResultDto {
  @ApiProperty()
  mediaAssetId!: string;

  @ApiProperty({
    description:
      'Adres do wysłania pliku metodą PUT. Dla sterownika memory jest to endpoint API.',
  })
  uploadUrl!: string;

  @ApiProperty()
  objectKey!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: BeginMediaUploadHeadersDto })
  headers!: BeginMediaUploadHeadersDto;
}

export class MediaImageDto {
  @ApiProperty()
  mediaAssetId!: string;

  @ApiProperty({ description: 'Krótko żyjący podpisany URL. Nie zapisuj go.' })
  url!: string;

  @ApiProperty({ type: String, nullable: true })
  thumbnailUrl!: string | null;
}

export class MediaAssetDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  kitchenId!: string;

  @ApiProperty({ enum: MediaPurpose })
  purpose!: MediaPurpose;

  @ApiProperty({ enum: MediaUploadStatus })
  status!: MediaUploadStatus;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  byteSize!: number;

  @ApiProperty({ type: Number, nullable: true })
  width!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  height!: number | null;

  @ApiProperty({ type: MediaImageDto, nullable: true })
  image!: MediaImageDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class AttachMediaDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  mediaAssetId!: string;
}

export class AttachedMediaDto {
  @ApiProperty({ description: 'Id produktu, przepisu albo kroku przepisu.' })
  targetId!: string;

  @ApiProperty({ type: MediaImageDto, nullable: true })
  image!: MediaImageDto | null;
}

/**
 * Tylko dla sterownika `memory` (testy e2e). Zastępuje wysyłkę na podpisany URL.
 */
export class MemoryUploadDto {
  @ApiProperty({ description: 'Zawartość pliku zakodowana w base64.' })
  @IsString()
  @IsBase64()
  contentBase64!: string;
}
