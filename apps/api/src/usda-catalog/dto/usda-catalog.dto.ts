import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import {
  NutritionDataSource,
  ProductUnit,
} from '../../generated/prisma/client';

export class UsdaCatalogSearchQueryDto {
  @ApiProperty({ example: 'pomidor', minLength: 2 })
  @IsString()
  @MinLength(2)
  q!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 20;
}

export class UsdaCatalogSearchItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fdcId!: number;

  @ApiProperty()
  polishName!: string;

  @ApiProperty()
  variantLabel!: string;

  @ApiProperty()
  descriptionOriginal!: string;

  @ApiProperty()
  compositionMayVary!: boolean;

  @ApiProperty({ type: String, example: '18.000' })
  kcalPer100g!: string;

  @ApiProperty({ type: String, example: '0.990' })
  proteinGramsPer100g!: string;

  @ApiProperty({ type: String, example: '3.900' })
  carbsGramsPer100g!: string;

  @ApiProperty({ type: String, example: '0.300' })
  fatGramsPer100g!: string;

  @ApiProperty()
  basisLabel!: string;

  @ApiProperty()
  sourceDataset!: string;
}

export class UsdaCatalogSearchResponseDto {
  @ApiProperty()
  query!: string;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: [UsdaCatalogSearchItemDto] })
  items!: UsdaCatalogSearchItemDto[];
}

export class UsdaCatalogNutritionPer100gDto {
  @ApiProperty({ type: String })
  kcal!: string;

  @ApiProperty({ type: String })
  proteinGrams!: string;

  @ApiProperty({ type: String })
  carbsGrams!: string;

  @ApiProperty({ type: String })
  fatGrams!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  fiberGrams!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  saltGrams!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  sodiumMg!: string | null;
}

export class UsdaCatalogEntryDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fdcId!: number;

  @ApiProperty()
  polishName!: string;

  @ApiProperty({ type: [String] })
  aliases!: string[];

  @ApiProperty()
  descriptionOriginal!: string;

  @ApiProperty()
  variantLabel!: string;

  @ApiProperty()
  dataType!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  category!: string | null;

  @ApiProperty()
  compositionMayVary!: boolean;

  @ApiProperty()
  basisLabel!: string;

  @ApiProperty()
  sourceDataset!: string;

  @ApiProperty()
  sourceRelease!: string;

  @ApiProperty()
  sourceUrl!: string;

  @ApiProperty()
  catalogVersion!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  importedAt!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  publicationDate!: string | null;

  @ApiProperty({ type: UsdaCatalogNutritionPer100gDto })
  nutritionPer100g!: UsdaCatalogNutritionPer100gDto;

  @ApiProperty()
  energyField!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  carbsMethod!: string | null;

  @ApiProperty()
  carbsApproximate!: boolean;

  @ApiProperty({ type: [String] })
  mappingWarnings!: string[];

  @ApiProperty()
  disclaimer!: string;
}

export class UsdaCatalogSuggestQueryDto {
  @ApiProperty({ enum: ProductUnit })
  @IsEnum(ProductUnit)
  productUnit!: ProductUnit;

  @ApiPropertyOptional({
    type: String,
    description:
      'Wymagane gdy productUnit=piece: masa części jadalnej 1 szt. w gramach.',
    example: '182',
  })
  @IsOptional()
  @IsString()
  pieceGrams?: string;
}

export class UsdaCatalogSuggestedNutritionDto {
  @ApiProperty({ type: String })
  baseQuantity!: string;

  @ApiProperty({ enum: ProductUnit })
  baseUnit!: ProductUnit;

  @ApiProperty({ type: String })
  kcal!: string;

  @ApiProperty({ type: String })
  proteinGrams!: string;

  @ApiProperty({ type: String })
  carbsGrams!: string;

  @ApiProperty({ type: String })
  fatGrams!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  fiberGrams!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  saltGrams!: string | null;

  @ApiProperty({
    enum: NutritionDataSource,
    example: NutritionDataSource.usda_fdc,
  })
  source!: NutritionDataSource;

  @ApiProperty()
  sourceGenericFoodId!: string;

  @ApiProperty()
  sourceFdcId!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  sourcePieceGrams!: string | null;

  @ApiProperty()
  sourceLabel!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  sourceFetchedAt!: string;
}

export class UsdaCatalogSuggestValuesDto {
  @ApiProperty({ type: UsdaCatalogEntryDetailDto })
  entry!: UsdaCatalogEntryDetailDto;

  @ApiProperty()
  disclaimer!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  compositionMayVaryNote!: string | null;

  @ApiProperty({ type: UsdaCatalogSuggestedNutritionDto })
  suggested!: UsdaCatalogSuggestedNutritionDto;

  @ApiProperty({ type: [String] })
  missingOptional!: string[];
}

export class UsdaCatalogEntryIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entryId!: string;
}
