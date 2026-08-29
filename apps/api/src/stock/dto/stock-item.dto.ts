import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { StorageLocation } from '../../generated/prisma/client';
import {
  EAN_PATTERN,
  IMAGE_URL_PATTERN,
  isPresentOptional,
} from './product.dto';

export class CreateStockItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({
    type: String,
    example: '500.000',
    description:
      'Początkowa i bieżąca ilość jako decimal string (max 3 miejsca).',
  })
  @IsString()
  @MinLength(1)
  quantity!: string;

  @ApiProperty({ enum: StorageLocation })
  @IsEnum(StorageLocation)
  location!: StorageLocation;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  purchasedAt?: string;

  @ApiPropertyOptional({
    example: 599,
    nullable: true,
    description:
      'Łączna cena zakupu początkowej partii w groszach; pominięcie = nieznana cena.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  purchasePriceMinor?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 120,
    description: 'Sklep / źródło (bez tworzenia Purchase).',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(120)
  storeName?: string | null;

  @ApiPropertyOptional({ example: 'PLN' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '5901234123457',
    description: 'Kod EAN partii; uzupełnia też produkt, gdy ten nie ma EAN.',
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
    description:
      'Zdjęcie partii (URL lub data URL); uzupełnia też produkt bez zdjęcia.',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(350_000)
  @Matches(IMAGE_URL_PATTERN, {
    message: 'imageUrl musi być adresem http(s) albo data URL obrazu.',
  })
  imageUrl?: string | null;
}

export class UpdateStockItemDto {
  @ApiPropertyOptional({ enum: StorageLocation })
  @IsOptional()
  @IsEnum(StorageLocation)
  location?: StorageLocation;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  purchasedAt?: string;

  @ApiPropertyOptional({ example: 599 })
  @IsOptional()
  @IsInt()
  @Min(0)
  purchasePriceMinor?: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @Matches(EAN_PATTERN, {
    message: 'ean musi mieć 8, 12, 13 lub 14 cyfr.',
  })
  ean?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(350_000)
  @Matches(IMAGE_URL_PATTERN, {
    message: 'imageUrl musi być adresem http(s) albo data URL obrazu.',
  })
  imageUrl?: string | null;
}

export class StockItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty({ type: String, example: '500.000' })
  initialQuantity!: string;

  @ApiProperty({ type: String, example: '500.000' })
  quantity!: string;

  @ApiProperty({ enum: StorageLocation })
  location!: StorageLocation;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  purchasedAt!: string | null;

  @ApiPropertyOptional({ example: 599, nullable: true })
  purchasePriceMinor!: number | null;

  @ApiProperty({ type: String, nullable: true })
  storeName!: string | null;

  @ApiProperty({ example: 'PLN' })
  currency!: string;

  @ApiProperty({ type: String, nullable: true })
  ean!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
