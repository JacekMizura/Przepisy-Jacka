import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ProductUnit, StorageLocation } from '../../generated/prisma/client';
import {
  ListPaginationQueryDto,
  PaginatedMetaDto,
} from '../../common/pagination.dto';
import { CatalogProductDto } from './product-group.dto';
import { isPresentOptional } from './product.dto';

export const CATALOG_SORT_VALUES = [
  'name',
  'newest',
  'updated',
  'has_stock',
] as const;
export type CatalogSort = (typeof CATALOG_SORT_VALUES)[number];

export class CatalogListQueryDto extends ListPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Filtr kategorii (string; brak osobnego categoryId w schemacie).',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ enum: StorageLocation })
  @IsOptional()
  @IsEnum(StorageLocation)
  place?: StorageLocation;

  @ApiPropertyOptional({ enum: ProductUnit })
  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

  @ApiPropertyOptional({
    enum: ['active', 'archived', 'all'],
    default: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'archived', 'all'])
  archived?: 'active' | 'archived' | 'all';

  @ApiPropertyOptional({
    enum: CATALOG_SORT_VALUES,
    default: 'name',
  })
  @IsOptional()
  @IsIn(CATALOG_SORT_VALUES)
  sort?: CatalogSort;

  @ApiPropertyOptional({
    description: 'Gdy true — tylko produkty z dodatnim stanem.',
  })
  @IsOptional()
  @IsIn(['true', 'false', '1', '0'])
  hasStock?: string;
}

export class CatalogProductRowDto {
  @ApiProperty({ enum: ['product'] })
  kind!: 'product';

  @ApiProperty({ type: CatalogProductDto })
  product!: CatalogProductDto;

  @ApiPropertyOptional({ type: String, nullable: true })
  groupName!: string | null;
}

export class CatalogGroupRowDto {
  @ApiProperty({ enum: ['group'] })
  kind!: 'group';

  @ApiProperty()
  groupId!: string;

  @ApiProperty()
  groupName!: string;

  @ApiProperty()
  variantCount!: number;

  @ApiProperty()
  batchCount!: number;

  @ApiProperty({ type: String })
  totalQuantity!: string;

  @ApiProperty({ enum: ProductUnit })
  defaultUnit!: ProductUnit;

  @ApiProperty({ type: [CatalogProductDto] })
  variants!: CatalogProductDto[];
}

export class CatalogPageDto extends PaginatedMetaDto {
  @ApiProperty({
    type: [CatalogProductRowDto],
    description: 'Wiersze produktu lub grupy (discriminated by kind).',
  })
  items!: Array<CatalogProductRowDto | CatalogGroupRowDto>;
}
