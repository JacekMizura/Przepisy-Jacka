import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  RecipeDifficulty,
  RecipeIngredientUnit,
  RecipeVisibility,
} from '../../generated/prisma/client';
import { isPresentOptional } from '../../stock/dto/product.dto';

export class RecipeIngredientInputDto {
  @ApiProperty({ example: 'Jajka' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ type: String, example: '2.000', nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MinLength(1)
  quantity?: string | null;

  @ApiProperty({ enum: RecipeIngredientUnit })
  @IsEnum(RecipeIngredientUnit)
  unit!: RecipeIngredientUnit;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(200)
  note?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUUID()
  productId?: string | null;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class RecipeStepInputDto {
  @ApiProperty({ example: 'Ugotuj makaron al dente.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  instruction!: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class CreateRecipeDto {
  @ApiProperty({ example: 'Makaron z sosem pomidorowym' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  servings!: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  @Min(1)
  prepTimeMinutes?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  @Min(1)
  cookTimeMinutes?: number | null;

  @ApiProperty({ enum: RecipeDifficulty })
  @IsEnum(RecipeDifficulty)
  difficulty!: RecipeDifficulty;

  @ApiPropertyOptional({ type: [String], example: ['obiad', 'wegetariańskie'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    enum: RecipeVisibility,
    default: RecipeVisibility.private,
  })
  @IsOptional()
  @IsEnum(RecipeVisibility)
  visibility?: RecipeVisibility;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  sourceUrl?: string | null;

  @ApiProperty({ type: [RecipeIngredientInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientInputDto)
  ingredients!: RecipeIngredientInputDto[];

  @ApiProperty({ type: [RecipeStepInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeStepInputDto)
  steps!: RecipeStepInputDto[];
}

export class UpdateRecipeDto {
  @ApiPropertyOptional({ example: 'Makaron z sosem pomidorowym' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  servings?: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  @Min(1)
  prepTimeMinutes?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  @Min(1)
  cookTimeMinutes?: number | null;

  @ApiPropertyOptional({ enum: RecipeDifficulty })
  @IsOptional()
  @IsEnum(RecipeDifficulty)
  difficulty?: RecipeDifficulty;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: RecipeVisibility })
  @IsOptional()
  @IsEnum(RecipeVisibility)
  visibility?: RecipeVisibility;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  sourceUrl?: string | null;

  @ApiPropertyOptional({ type: [RecipeIngredientInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientInputDto)
  ingredients?: RecipeIngredientInputDto[];

  @ApiPropertyOptional({ type: [RecipeStepInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeStepInputDto)
  steps?: RecipeStepInputDto[];
}

export class RecipeAuthorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class RecipeIngredientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: '2.000' })
  quantity!: string | null;

  @ApiProperty({ enum: RecipeIngredientUnit })
  unit!: RecipeIngredientUnit;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: String, nullable: true })
  productId!: string | null;

  @ApiProperty()
  sortOrder!: number;
}

export class RecipeStepDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  instruction!: string;

  @ApiProperty()
  sortOrder!: number;
}

export class RecipeSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  kitchenId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  servings!: number;

  @ApiProperty({ type: Number, nullable: true })
  prepTimeMinutes!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  cookTimeMinutes!: number | null;

  @ApiProperty({ enum: RecipeDifficulty })
  difficulty!: RecipeDifficulty;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ enum: RecipeVisibility })
  visibility!: RecipeVisibility;

  @ApiProperty({ type: RecipeAuthorDto })
  author!: RecipeAuthorDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class RecipeDetailDto extends RecipeSummaryDto {
  @ApiProperty({ type: String, nullable: true })
  sourceUrl!: string | null;

  @ApiProperty({ type: [RecipeIngredientDto] })
  ingredients!: RecipeIngredientDto[];

  @ApiProperty({ type: [RecipeStepDto] })
  steps!: RecipeStepDto[];
}
