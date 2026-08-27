import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

import { ProductUnit } from '../../generated/prisma/client';

export class UpsertProductNutritionDto {
  @ApiProperty({
    type: String,
    example: '100.000',
    description: 'Ilość odniesienia w jednostce bazowej produktu.',
  })
  @IsString()
  @MinLength(1)
  baseQuantity!: string;

  @ApiProperty({ enum: ProductUnit, example: ProductUnit.milliliter })
  @IsEnum(ProductUnit)
  baseUnit!: ProductUnit;

  @ApiProperty({ type: String, example: '64.000' })
  @IsString()
  @MinLength(1)
  kcal!: string;

  @ApiProperty({ type: String, example: '3.200' })
  @IsString()
  @MinLength(1)
  proteinGrams!: string;

  @ApiProperty({ type: String, example: '4.700' })
  @IsString()
  @MinLength(1)
  carbsGrams!: string;

  @ApiProperty({ type: String, example: '3.600' })
  @IsString()
  @MinLength(1)
  fatGrams!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '0.000' })
  @IsOptional()
  @IsString()
  fiberGrams?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '0.100' })
  @IsOptional()
  @IsString()
  saltGrams?: string | null;
}

export class ProductNutritionDto {
  @ApiProperty()
  productId!: string;

  @ApiProperty({ type: String, example: '100.000' })
  baseQuantity!: string;

  @ApiProperty({ enum: ProductUnit })
  baseUnit!: ProductUnit;

  @ApiProperty({ type: String, example: '64.000' })
  kcal!: string;

  @ApiProperty({ type: String })
  proteinGrams!: string;

  @ApiProperty({ type: String })
  carbsGrams!: string;

  @ApiProperty({ type: String })
  fatGrams!: string;

  @ApiProperty({ type: String, nullable: true })
  fiberGrams!: string | null;

  @ApiProperty({ type: String, nullable: true })
  saltGrams!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
