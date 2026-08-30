import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ProductUnit } from '../../generated/prisma/client';
import { MediaImageDto } from '../../media/dto/media.dto';
import { isPresentOptional, ProductDto } from './product.dto';

export class CreateProductGroupDto {
  @ApiProperty({ example: 'Mozzarella' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class UpdateProductGroupDto {
  @ApiProperty({ example: 'Mozzarella' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class ProductGroupDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  kitchenId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  normalizedName!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class ProductGroupStockByUnitDto {
  @ApiProperty({ enum: ProductUnit })
  unit!: ProductUnit;

  @ApiProperty({ type: String, example: '1250.000' })
  totalQuantity!: string;
}

export class ProductGroupSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  productCount!: number;

  @ApiProperty()
  activeProductCount!: number;

  @ApiProperty()
  batchCount!: number;

  @ApiProperty({ type: [ProductGroupStockByUnitDto] })
  stockByUnit!: ProductGroupStockByUnitDto[];

  @ApiProperty({
    type: [MediaImageDto],
    description: 'Do 4 okładek z produktów w grupie.',
  })
  coverImages!: MediaImageDto[];

  @ApiProperty({
    description: 'Liczba produktów w grupie mających wartości odżywcze.',
  })
  hasNutritionCount!: number;
}

export class ProductGroupDetailDto extends ProductGroupDto {
  @ApiProperty({ type: [ProductDto] })
  products!: ProductDto[];

  @ApiProperty({ type: ProductGroupSummaryDto })
  summary!: ProductGroupSummaryDto;
}

export class AssignProductGroupDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'null odłącza produkt od grupy.',
  })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  groupId!: string | null;
}

export class ListProductGroupsQueryDto {
  @ApiPropertyOptional({
    description: 'Szukaj po nazwie grupy / produktu / marce / wariancie / EAN.',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    enum: ['active', 'archived', 'all'],
    description: 'Filtr produktów wliczanych do podsumowań. Domyślnie active.',
  })
  @IsOptional()
  @IsString()
  archive?: string;
}

export class SearchProductGroupsQueryDto {
  @ApiProperty({ example: 'mozz' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  q!: string;
}

export class CatalogProductDto extends ProductDto {
  @ApiProperty()
  batchCount!: number;

  @ApiProperty({
    type: String,
    description: 'Suma ilości w defaultUnit produktu (aktywne partie).',
  })
  totalQuantity!: string;
}

export class KitchenCatalogDto {
  @ApiProperty({ type: [ProductGroupSummaryDto] })
  groups!: ProductGroupSummaryDto[];

  @ApiProperty({ type: [CatalogProductDto] })
  ungroupedProducts!: CatalogProductDto[];
}

export class CatalogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  search?: string;
}
