import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RecipeGapSelectionDto {
  @ApiProperty()
  @IsUUID()
  ingredientId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  skip?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  purchaseOptionId?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  packageCount?: number;

  @ApiPropertyOptional({ type: String, example: '300.000' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  exactQuantity?: string;
}

export class AddRecipeGapsDto {
  @ApiProperty({ example: 'gap-add-2026-08-25-abc123' })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  servings!: number;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Identyfikatory składników ze statusem unknown, które użytkownik chce dodać ręcznie.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  includeIngredientIds?: string[];

  @ApiPropertyOptional({
    type: [RecipeGapSelectionDto],
    description:
      'Wybór wariantu zakupu per składnik. Gdy brak — auto-proposal dla partial/missing.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RecipeGapSelectionDto)
  selections?: RecipeGapSelectionDto[];
}

export class AddedRecipeGapItemDto {
  @ApiProperty()
  ingredientId!: string;

  @ApiProperty()
  ingredientName!: string;

  @ApiProperty({ type: String, nullable: true })
  productId!: string | null;

  @ApiProperty({ type: String, example: '250.000' })
  quantity!: string;

  @ApiProperty()
  unit!: string;

  @ApiProperty()
  shoppingListItemId!: string;
}

export class SkippedRecipeGapItemDto {
  @ApiProperty()
  ingredientId!: string;

  @ApiProperty()
  ingredientName!: string;

  @ApiProperty()
  reason!: string;
}

export class AddRecipeGapsResultDto {
  @ApiProperty()
  recipeId!: string;

  @ApiProperty()
  servings!: number;

  @ApiProperty()
  idempotencyKey!: string;

  @ApiProperty({ type: [AddedRecipeGapItemDto] })
  added!: AddedRecipeGapItemDto[];

  @ApiProperty({ type: [SkippedRecipeGapItemDto] })
  skipped!: SkippedRecipeGapItemDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
