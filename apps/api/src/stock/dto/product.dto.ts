import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  ProductPurchaseMode,
  ProductUnit,
} from '../../generated/prisma/client';
import { MediaImageDto } from '../../media/dto/media.dto';
import { ProductNutritionDto } from './product-nutrition.dto';
import { PurchaseOptionDto } from './purchase-option.dto';

/** EAN-8 / UPC-A / EAN-13 / GTIN-14 (same digits). */
export const EAN_PATTERN = /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/;

/** http(s) URL or compressed data URL from the web client. */
export const IMAGE_URL_PATTERN =
  /^(https?:\/\/[^\s]+|data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+)$/i;

export function isPresentOptional(_object: unknown, value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

export class CreateProductDto {
  @ApiProperty({ example: 'Mleko' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ProductUnit, example: ProductUnit.milliliter })
  @IsEnum(ProductUnit)
  defaultUnit!: ProductUnit;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '5901234123457',
    description: 'Kod EAN/GTIN (8, 12, 13 lub 14 cyfr).',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @Matches(EAN_PATTERN, {
    message: 'ean musi mieć 8, 12, 13 lub 14 cyfr.',
  })
  ean?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'URL http(s) albo data URL obrazu (jpeg/png/webp/gif).',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(350_000)
  @Matches(IMAGE_URL_PATTERN, {
    message: 'imageUrl musi być adresem http(s) albo data URL obrazu.',
  })
  imageUrl?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Nabiał',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category?: string | null;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Mleko UHT' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ProductUnit })
  @IsOptional()
  @IsEnum(ProductUnit)
  defaultUnit?: ProductUnit;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '5901234123457',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @Matches(EAN_PATTERN, {
    message: 'ean musi mieć 8, 12, 13 lub 14 cyfr.',
  })
  ean?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Nabiał' })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category?: string | null;

  @ApiPropertyOptional({ enum: ProductPurchaseMode })
  @IsOptional()
  @IsEnum(ProductPurchaseMode)
  purchaseMode?: ProductPurchaseMode;
}

export class ConfigureProductPurchaseOptionDto {
  @ApiProperty({ example: 'Karton 1 l' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ type: String, example: '1000.000' })
  @IsString()
  @MinLength(1)
  contentQuantity!: string;

  @ApiProperty({ enum: ProductUnit })
  @IsEnum(ProductUnit)
  contentUnit!: ProductUnit;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class ConfigureProductPurchaseDto {
  @ApiProperty({
    enum: ProductPurchaseMode,
    description:
      'packaged wymaga pierwszej opcji; exact nie wymaga opcji; unconfigured czyści tryb bez usuwania opcji.',
  })
  @IsEnum(ProductPurchaseMode)
  mode!: ProductPurchaseMode;

  @ApiPropertyOptional({ type: ConfigureProductPurchaseOptionDto })
  @ValidateIf(
    (dto: ConfigureProductPurchaseDto) =>
      dto.mode === ProductPurchaseMode.packaged,
  )
  @ValidateNested()
  @Type(() => ConfigureProductPurchaseOptionDto)
  option?: ConfigureProductPurchaseOptionDto;
}

export class ProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  kitchenId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  normalizedName!: string;

  @ApiProperty({ enum: ProductUnit })
  defaultUnit!: ProductUnit;

  @ApiProperty({ enum: ProductPurchaseMode })
  purchaseMode!: ProductPurchaseMode;

  @ApiProperty({ type: String, nullable: true })
  ean!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Starsze źródło zdjęcia (http lub data URL).',
  })
  imageUrl!: string | null;

  @ApiProperty({
    type: MediaImageDto,
    nullable: true,
    description: 'Zdjęcie z magazynu mediów; podpisane URL-e wygasają.',
  })
  image!: MediaImageDto | null;

  @ApiProperty({ type: ProductNutritionDto, nullable: true })
  nutrition!: ProductNutritionDto | null;

  @ApiProperty({ type: String, nullable: true })
  category!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Null = aktywny katalog; ustawione = zarchiwizowany.',
  })
  archivedAt!: string | null;

  @ApiProperty({
    description: 'true gdy archivedAt jest ustawione.',
  })
  isArchived!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({ type: [PurchaseOptionDto] })
  purchaseOptions?: PurchaseOptionDto[];
}
