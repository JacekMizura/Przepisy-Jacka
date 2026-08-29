import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const STOCK_CONSUMPTION_KINDS = ['consume', 'write_off'] as const;
export type StockConsumptionKindValue =
  (typeof STOCK_CONSUMPTION_KINDS)[number];

export const STOCK_CONSUMPTION_REASON_MAX_LENGTH = 200;

export class ManualConsumeLineDto {
  @ApiProperty()
  @IsUUID()
  stockItemId!: string;

  @ApiProperty({ type: String, example: '100.000' })
  @IsString()
  @MinLength(1)
  quantity!: string;
}

export class ConsumeStockPreviewDto {
  @ApiProperty({ type: String, example: '600.000' })
  @IsString()
  @MinLength(1)
  quantity!: string;

  @ApiPropertyOptional({ type: [ManualConsumeLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualConsumeLineDto)
  manualLines?: ManualConsumeLineDto[];
}

function trimReason(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class ConsumeStockCommitDto extends ConsumeStockPreviewDto {
  @ApiProperty({ description: 'Klucz idempotencji żądania zużycia.' })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;

  @ApiProperty({
    description:
      'Odcisk partii z podglądu — wymagany przy zatwierdzeniu propozycji FIFO.',
  })
  @IsString()
  @MinLength(8)
  previewFingerprint!: string;

  @ApiPropertyOptional({
    enum: STOCK_CONSUMPTION_KINDS,
    required: false,
    description:
      'consume = zwykłe zużycie; write_off = odpis (wymaga reason). Pominięcie = consume (domyślnie).',
  })
  @IsOptional()
  @IsIn(STOCK_CONSUMPTION_KINDS)
  kind?: StockConsumptionKindValue;

  @ApiPropertyOptional({
    description:
      'Powód odpisu (wymagany dla write_off, max 200 znaków po trimie).',
    maxLength: STOCK_CONSUMPTION_REASON_MAX_LENGTH,
    example: 'Przeterminowane — wyrzucone',
    required: false,
  })
  @Transform(({ value }) => trimReason(value))
  @IsOptional()
  @IsString()
  @MaxLength(STOCK_CONSUMPTION_REASON_MAX_LENGTH)
  reason?: string;
}

export class ConsumeAllocationLineDto {
  @ApiProperty()
  stockItemId!: string;

  @ApiProperty({ type: String })
  quantity!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  costMinor!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  storeName!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  purchasedAt!: string | null;

  @ApiPropertyOptional({ type: String })
  remainingQuantity!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  purchasePriceMinor!: number | null;

  @ApiPropertyOptional()
  isExpired!: boolean;
}

export class ConsumeStockPreviewResultDto {
  @ApiProperty({ type: String })
  quantity!: string;

  @ApiProperty({ type: [ConsumeAllocationLineDto] })
  lines!: ConsumeAllocationLineDto[];

  @ApiProperty({ type: String })
  totalQuantity!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  totalCostMinor!: number | null;

  @ApiProperty()
  costComplete!: boolean;

  @ApiProperty()
  previewFingerprint!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  insufficientQuantity!: string | null;

  @ApiProperty()
  disclaimer!: string;
}

export class StockConsumptionLineDto {
  @ApiProperty()
  stockItemId!: string;

  @ApiProperty({ type: String })
  quantity!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  costMinor!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  storeName!: string | null;
}

export class StockConsumptionResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiPropertyOptional({ type: String })
  productName?: string;

  @ApiProperty({ enum: STOCK_CONSUMPTION_KINDS })
  kind!: StockConsumptionKindValue;

  @ApiPropertyOptional({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({ type: String })
  totalQuantity!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  totalCostMinor!: number | null;

  @ApiProperty()
  costComplete!: boolean;

  @ApiProperty({ type: [StockConsumptionLineDto] })
  lines!: StockConsumptionLineDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  reversesConsumptionId!: string | null;

  @ApiProperty()
  isReversal!: boolean;

  @ApiProperty()
  isReversed!: boolean;
}

export class ReverseConsumptionDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
