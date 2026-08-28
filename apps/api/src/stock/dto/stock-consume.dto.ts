import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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
}

export class StockConsumptionResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

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
}

export class ReverseConsumptionDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
