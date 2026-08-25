import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  ProductUnit,
  ShoppingInputUnit,
  ShoppingListItemStatus,
} from '../../generated/prisma/client';
import { isPresentOptional } from '../../stock/dto/product.dto';

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

  @ApiProperty({ type: String, nullable: true })
  ean!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

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
}
