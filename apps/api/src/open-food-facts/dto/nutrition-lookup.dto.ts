import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ProductUnit } from '../../generated/prisma/client';

export class NutritionLookupValuesDto {
  @ApiProperty({ type: String, example: '100.000' })
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

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Dane opcjonalne z Open Food Facts (nie zapisywane w ProductNutrition).',
  })
  sugarsGrams!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  saturatedFatGrams!: string | null;
}

export class NutritionLookupResultDto {
  @ApiProperty({
    enum: [
      'found',
      'not_found',
      'incomplete',
      'provider_error',
      'rate_limited',
    ],
  })
  status!:
    'found' | 'not_found' | 'incomplete' | 'provider_error' | 'rate_limited';

  @ApiProperty()
  message!: string;

  @ApiProperty({ example: '3017624010701' })
  ean!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  productName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  brand!: string | null;

  @ApiPropertyOptional({ type: NutritionLookupValuesDto, nullable: true })
  nutrition!: NutritionLookupValuesDto | null;

  @ApiProperty({ type: [String] })
  missingFields!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  fetchedAt!: string;

  @ApiProperty({ example: 'Open Food Facts' })
  attribution!: string;
}
