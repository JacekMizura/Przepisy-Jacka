import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  ProductPurchaseMode,
  ProductUnit,
  ShoppingInputUnit,
  ShoppingListItemStatus,
} from '../../generated/prisma/client';
import { MediaImageDto } from '../../media/dto/media.dto';
import { isPresentOptional } from '../../stock/dto/product.dto';
import { PurchaseOptionSummaryDto } from '../../stock/dto/purchase-option.dto';

export class CreateShoppingListItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ example: 'Papryka czerwona' })
  @ValidateIf((dto: CreateShoppingListItemDto) => !dto.productId)
  @IsString()
  @MinLength(1)
  customName?: string;

  @ApiPropertyOptional({ type: String, example: '2.000' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  plannedQuantity?: string;

  @ApiPropertyOptional({ enum: ShoppingInputUnit })
  @IsOptional()
  @IsEnum(ShoppingInputUnit)
  plannedUnit?: ShoppingInputUnit;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({
    description:
      'Gdy true, dodaje ilość do istniejącej pozycji pending z tym samym produktem.',
  })
  @IsOptional()
  @IsBoolean()
  mergeQuantity?: boolean;

  @ApiPropertyOptional({ type: String, example: '100.000' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  requiredQuantity?: string;

  @ApiPropertyOptional({ enum: ShoppingInputUnit })
  @IsOptional()
  @IsEnum(ShoppingInputUnit)
  requiredUnit?: ShoppingInputUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceRecipeId?: string;

  @ApiPropertyOptional({ example: 'Omlet' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  sourceRecipeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  purchaseOptionId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  packageCount?: number;
}

export class UpdateShoppingListItemDto {
  @ApiPropertyOptional({ example: 'Papryka czerwona' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  customName?: string;

  @ApiPropertyOptional({ type: String, example: '2.000' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  plannedQuantity?: string;

  @ApiPropertyOptional({ enum: ShoppingInputUnit })
  @IsOptional()
  @IsEnum(ShoppingInputUnit)
  plannedUnit?: ShoppingInputUnit;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({ type: String, example: '100.000' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  requiredQuantity?: string;

  @ApiPropertyOptional({ enum: ShoppingInputUnit })
  @IsOptional()
  @IsEnum(ShoppingInputUnit)
  requiredUnit?: ShoppingInputUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  purchaseOptionId?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  packageCount?: number;
}

export class UpdateShoppingListItemStatusDto {
  @ApiProperty({ enum: ShoppingListItemStatus })
  @IsEnum(ShoppingListItemStatus)
  status!: ShoppingListItemStatus;
}

export class ShoppingListItemProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ProductUnit })
  defaultUnit!: ProductUnit;

  @ApiProperty({ enum: ProductPurchaseMode })
  purchaseMode!: ProductPurchaseMode;

  @ApiProperty({ type: String, nullable: true })
  ean!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ type: MediaImageDto, nullable: true })
  image!: MediaImageDto | null;

  @ApiProperty({ type: String, nullable: true })
  category!: string | null;
}

export class ShoppingListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  shoppingListId!: string;

  @ApiProperty({ type: String, nullable: true })
  productId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  customName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2.000' })
  plannedQuantity!: string | null;

  @ApiProperty({ enum: ShoppingInputUnit, nullable: true })
  plannedUnit!: ShoppingInputUnit | null;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ enum: ShoppingListItemStatus })
  status!: ShoppingListItemStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: string | null;

  @ApiPropertyOptional({ type: ShoppingListItemProductDto, nullable: true })
  product!: ShoppingListItemProductDto | null;

  @ApiProperty({ type: String, nullable: true, example: '100.000' })
  requiredQuantity!: string | null;

  @ApiProperty({ enum: ShoppingInputUnit, nullable: true })
  requiredUnit!: ShoppingInputUnit | null;

  @ApiProperty({ type: String, nullable: true })
  sourceRecipeId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sourceRecipeName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  purchaseOptionId!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  packageCount!: number | null;

  @ApiPropertyOptional({ type: PurchaseOptionSummaryDto, nullable: true })
  purchaseOption!: PurchaseOptionSummaryDto | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Szacunek w groszach na podstawie ostatniej ceny zakupu produktu (skalowany do pozycji).',
  })
  estimatedPriceMinor!: number | null;
}
