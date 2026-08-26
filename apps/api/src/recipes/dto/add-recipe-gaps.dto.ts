import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

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
