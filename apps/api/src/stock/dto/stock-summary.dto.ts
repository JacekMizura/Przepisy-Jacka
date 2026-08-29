import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ProductUnit, StorageLocation } from '../../generated/prisma/client';

export class StockBatchDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String })
  quantity!: string;

  @ApiProperty({ type: String })
  initialQuantity!: string;

  @ApiProperty({ enum: StorageLocation })
  location!: StorageLocation;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  purchasedAt!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  purchasePriceMinor!: number | null;

  @ApiProperty({ example: 'PLN' })
  currency!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  unitPriceMinor!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  storeName!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  purchaseId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  receiptMediaId!: string | null;

  @ApiProperty()
  isExpired!: boolean;

  @ApiProperty({
    description:
      'Czy fizyczne usunięcie jest dozwolone (tylko ręczna, niepowiązana, nigdy nieużyta partia).',
  })
  canDelete!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Powód blokady usunięcia; null gdy canDelete=true.',
  })
  deleteBlockReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class StockProductSummaryDto {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty({ enum: ProductUnit })
  defaultUnit!: ProductUnit;

  @ApiPropertyOptional({ type: String, nullable: true })
  category!: string | null;

  @ApiProperty({
    description: 'Produkt zarchiwizowany (historia i partie zachowane).',
  })
  isArchived!: boolean;

  @ApiProperty({ type: String })
  totalQuantity!: string;

  @ApiProperty()
  batchCount!: number;

  @ApiProperty()
  expiringBatchCount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  nearestExpiry!: string | null;

  @ApiProperty({ type: [StockBatchDetailDto] })
  batches!: StockBatchDetailDto[];
}
