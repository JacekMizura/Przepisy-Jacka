import { ApiProperty } from '@nestjs/swagger';

import { ProductUnit } from '../../generated/prisma/client';

export class NutritionTotalsDto {
  @ApiProperty({ type: String, example: '384.00' })
  kcal!: string;

  @ApiProperty({ type: String, example: '19.20' })
  proteinGrams!: string;

  @ApiProperty({ type: String, example: '28.20' })
  carbsGrams!: string;

  @ApiProperty({ type: String, example: '21.60' })
  fatGrams!: string;
}

export class RecipeNutritionEstimateDto {
  @ApiProperty()
  isComplete!: boolean;

  @ApiProperty()
  countedIngredients!: number;

  @ApiProperty()
  totalIngredients!: number;

  @ApiProperty({ type: [String] })
  missingIngredientNames!: string[];

  @ApiProperty({
    type: NutritionTotalsDto,
    nullable: true,
    description: 'null, gdy żaden składnik nie ma danych.',
  })
  recipe!: NutritionTotalsDto | null;

  @ApiProperty({ type: NutritionTotalsDto, nullable: true })
  perServing!: NutritionTotalsDto | null;
}

export class RecipeCostPriceSourceDto {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  purchasedAt!: string;

  @ApiProperty({ type: String, example: '0.3200' })
  unitPriceMinorPerBase!: string;

  @ApiProperty({ enum: ProductUnit })
  baseUnit!: ProductUnit;
}

export class RecipeCostEstimateDto {
  @ApiProperty()
  isComplete!: boolean;

  @ApiProperty()
  countedIngredients!: number;

  @ApiProperty()
  totalIngredients!: number;

  @ApiProperty({ type: [String] })
  missingIngredientNames!: string[];

  @ApiProperty({ type: Number, nullable: true, example: 192 })
  recipeTotalMinor!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 96 })
  perServingMinor!: number | null;

  @ApiProperty({ type: [RecipeCostPriceSourceDto] })
  priceSources!: RecipeCostPriceSourceDto[];

  @ApiProperty({ example: 'Szacunkowo na podstawie ostatnich zakupów' })
  note!: string;
}

export class RecipeEstimateDto {
  @ApiProperty()
  servings!: number;

  @ApiProperty({ type: RecipeNutritionEstimateDto })
  nutrition!: RecipeNutritionEstimateDto;

  @ApiProperty({ type: RecipeCostEstimateDto })
  cost!: RecipeCostEstimateDto;
}
