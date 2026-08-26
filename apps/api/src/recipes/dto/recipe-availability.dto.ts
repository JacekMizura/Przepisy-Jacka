import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ProductPurchaseMode,
  ProductUnit,
  RecipeIngredientUnit,
} from '../../generated/prisma/client';
import { PurchaseProposalDto } from './purchase-proposal.dto';

export type IngredientAvailabilityStatusDto =
  'available' | 'partial' | 'missing' | 'unknown';

export class RecipeIngredientAvailabilityDto {
  @ApiProperty()
  ingredientId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  productId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  productName!: string | null;

  @ApiProperty({ enum: ProductPurchaseMode, nullable: true })
  purchaseMode!: ProductPurchaseMode | null;

  @ApiProperty({ type: String, nullable: true, example: '4.000' })
  scaledQuantity!: string | null;

  @ApiProperty({ enum: RecipeIngredientUnit })
  unit!: RecipeIngredientUnit;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({
    enum: ['available', 'partial', 'missing', 'unknown'],
  })
  status!: IngredientAvailabilityStatusDto;

  @ApiProperty({ type: String, nullable: true, example: '500.000' })
  availableQuantity!: string | null;

  @ApiProperty({ enum: ProductUnit, nullable: true })
  availableUnit!: ProductUnit | null;

  @ApiProperty({ type: String, nullable: true, example: '250.000' })
  gapQuantity!: string | null;

  @ApiProperty({ enum: RecipeIngredientUnit, nullable: true })
  gapUnit!: RecipeIngredientUnit | null;

  @ApiProperty({ type: String, nullable: true, example: '1.000' })
  requiredQuantity!: string | null;

  @ApiPropertyOptional({ type: PurchaseProposalDto, nullable: true })
  purchaseProposal!: PurchaseProposalDto | null;
}

export class RecipeAvailabilityDto {
  @ApiProperty()
  recipeId!: string;

  @ApiProperty()
  servings!: number;

  @ApiProperty()
  baseServings!: number;

  @ApiProperty({ type: [RecipeIngredientAvailabilityDto] })
  ingredients!: RecipeIngredientAvailabilityDto[];
}

export class RecipeAvailabilityQueryDto {
  @ApiProperty({ example: 4 })
  servings!: number;
}
