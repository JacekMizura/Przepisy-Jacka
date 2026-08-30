import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ProductUnit, StorageLocation } from '../../generated/prisma/client';
import {
  ListPaginationQueryDto,
  PaginatedMetaDto,
} from '../../common/pagination.dto';
import { isPresentOptional } from './product.dto';
import { StockProductSummaryDto } from './stock-summary.dto';

export const STOCK_SORT_VALUES = [
  'expiry',
  'newest',
  'name',
  'qty_desc',
  'qty_asc',
] as const;
export type StockSort = (typeof STOCK_SORT_VALUES)[number];

export const EXPIRY_STATUS_VALUES = [
  'any',
  'expired',
  'expiring',
  'ok',
  'none',
] as const;
export type ExpiryStatusFilter = (typeof EXPIRY_STATUS_VALUES)[number];

export class StockSummaryQueryDto extends ListPaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Szukaj po nazwie / marce / wariancie / EAN / kategorii.',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Filtr kategorii produktu (string; w schemacie nie ma categoryId).',
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

  /** Alias dla place — kompatybilność z wcześniejszym ?location=. */
  @ApiPropertyOptional({ enum: StorageLocation })
  @IsOptional()
  @IsEnum(StorageLocation)
  location?: StorageLocation;

  @ApiPropertyOptional({ enum: ProductUnit })
  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

  @ApiPropertyOptional({
    enum: EXPIRY_STATUS_VALUES,
    default: 'any',
  })
  @IsOptional()
  @IsIn(EXPIRY_STATUS_VALUES)
  expiryStatus?: ExpiryStatusFilter;

  @ApiPropertyOptional({
    enum: ['active', 'archived', 'all'],
    description:
      'Domyślnie all — zapasy pokazują też zarchiwizowane z dodatnim stanem.',
    default: 'all',
  })
  @IsOptional()
  @IsIn(['active', 'archived', 'all'])
  archived?: 'active' | 'archived' | 'all';

  @ApiPropertyOptional({
    enum: STOCK_SORT_VALUES,
    default: 'expiry',
  })
  @IsOptional()
  @IsIn(STOCK_SORT_VALUES)
  sort?: StockSort;
}

export class StockProductListItemDto extends StockProductSummaryDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  brand!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  variantLabel!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  groupId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  groupName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiPropertyOptional({ enum: StorageLocation, nullable: true })
  primaryLocation!: StorageLocation | null;

  @ApiProperty({
    description: 'Najpóźniejsza data utworzenia partii (do sortowania).',
    type: String,
    format: 'date-time',
  })
  latestBatchAt!: string;
}

export class StockGroupListItemDto {
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

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  nearestExpiry!: string | null;

  @ApiProperty()
  expiringBatchCount!: number;

  @ApiPropertyOptional({ enum: StorageLocation, nullable: true })
  primaryLocation!: StorageLocation | null;

  @ApiProperty({ type: [StockProductListItemDto] })
  variants!: StockProductListItemDto[];
}

export class StockProductRowDto {
  @ApiProperty({ enum: ['product'] })
  kind!: 'product';

  @ApiProperty({ type: StockProductListItemDto })
  product!: StockProductListItemDto;
}

export class StockSummaryPageDto extends PaginatedMetaDto {
  @ApiProperty({
    description: 'Wiersze produktu lub grupy (discriminated by kind).',
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(StockProductRowDto) },
        { $ref: getSchemaPath(StockGroupListItemDto) },
      ],
    },
  })
  items!: Array<StockProductRowDto | StockGroupListItemDto>;
}
