import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  NutritionDataSource,
  ProductUnit,
} from '../../generated/prisma/client';
import { isPresentOptional } from './product.dto';

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

  @ApiPropertyOptional({
    enum: NutritionDataSource,
    description:
      'Pochodzenie zatwierdzonych danych. open_food_facts i usda_fdc wymagają sourceFetchedAt.',
  })
  @IsOptional()
  @IsEnum(NutritionDataSource)
  source?: NutritionDataSource;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Data pobrania / importu źródła (ISO-8601).',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsISO8601()
  sourceFetchedAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(200)
  sourceLabel?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(200)
  sourceBrand?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Id wpisu katalogu USDA w momencie zatwierdzenia (kopia).',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUUID()
  sourceGenericFoodId?: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'FDC ID zatwierdzonego wpisu USDA.',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  sourceFdcId?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Jawna masa części jadalnej 1 szt. (g), gdy baseUnit=piece.',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  sourcePieceGrams?: string | null;
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

  @ApiProperty({ enum: NutritionDataSource })
  source!: NutritionDataSource;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  sourceFetchedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sourceLabel!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sourceBrand!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sourceGenericFoodId!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  sourceFdcId!: number | null;

  @ApiProperty({ type: String, nullable: true })
  sourcePieceGrams!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
