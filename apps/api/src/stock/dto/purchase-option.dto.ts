import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { ProductUnit } from '../../generated/prisma/client';

export class CreatePurchaseOptionDto {
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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdatePurchaseOptionDto {
  @ApiPropertyOptional({ example: 'Karton 1 l' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ type: String, example: '1000.000' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  contentQuantity?: string;

  @ApiPropertyOptional({ enum: ProductUnit })
  @IsOptional()
  @IsEnum(ProductUnit)
  contentUnit?: ProductUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PurchaseOptionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, example: '1000.000' })
  contentQuantity!: string;

  @ApiProperty({ enum: ProductUnit })
  contentUnit!: ProductUnit;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class PurchaseOptionSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, example: '1000.000' })
  contentQuantity!: string;

  @ApiProperty({ enum: ProductUnit })
  contentUnit!: ProductUnit;
}
