import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

import { StorageLocation } from '../../generated/prisma/client';

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

  @ApiProperty({
    example: 599,
    description: 'Łączna cena zakupu początkowej partii w groszach.',
  })
  @IsInt()
  @Min(0)
  purchasePriceMinor!: number;

  @ApiPropertyOptional({ example: 'PLN' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateStockItemDto {
  @ApiPropertyOptional({ type: String, example: '200.000' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  quantity?: string;

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

  @ApiProperty({ example: 599 })
  purchasePriceMinor!: number;

  @ApiProperty({ example: 'PLN' })
  currency!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
