import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

import { ProductUnit } from '../../generated/prisma/client';

export class CreateProductDto {
  @ApiProperty({ example: 'Mleko' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ProductUnit, example: ProductUnit.milliliter })
  @IsEnum(ProductUnit)
  defaultUnit!: ProductUnit;
}

export class ProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  kitchenId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  normalizedName!: string;

  @ApiProperty({ enum: ProductUnit })
  defaultUnit!: ProductUnit;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
