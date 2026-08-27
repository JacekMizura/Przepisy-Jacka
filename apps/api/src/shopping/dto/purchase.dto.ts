import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  ProductUnit,
  ShoppingInputUnit,
  StorageLocation,
} from '../../generated/prisma/client';
import { MediaImageDto } from '../../media/dto/media.dto';

export class CheckoutCreateProductDto {
  @ApiProperty({ example: 'Papryka' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: ProductUnit })
  @IsEnum(ProductUnit)
  defaultUnit!: ProductUnit;
}

export class CheckoutPurchaseLineDto {
  @ApiProperty()
  @IsUUID()
  shoppingListItemId!: string;

  @ApiProperty({ type: String, example: '1.000' })
  @IsString()
  @MinLength(1)
  quantity!: string;

  @ApiProperty({ enum: ShoppingInputUnit })
  @IsEnum(ShoppingInputUnit)
  inputUnit!: ShoppingInputUnit;

  @ApiProperty({ enum: StorageLocation })
  @IsEnum(StorageLocation)
  location!: StorageLocation;

  @ApiProperty({ example: 599 })
  @IsInt()
  @Min(0)
  priceMinor!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ type: CheckoutCreateProductDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutCreateProductDto)
  createProduct?: CheckoutCreateProductDto;
}

export class CheckoutPurchaseDto {
  @ApiProperty({ minLength: 8, example: 'checkout-key-001' })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;

  @ApiPropertyOptional({ example: 'Biedronka' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  storeName?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  purchasedAt?: string;

  @ApiPropertyOptional({ example: 'PLN' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ type: [CheckoutPurchaseLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutPurchaseLineDto)
  lines!: CheckoutPurchaseLineDto[];
}

export class PurchaseLineItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty({ type: String, nullable: true })
  stockItemId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  shoppingListItemId!: string | null;

  @ApiProperty({ type: String, example: '500.000' })
  quantity!: string;

  @ApiProperty({ example: 599 })
  priceMinor!: number;

  @ApiProperty({ enum: StorageLocation })
  location!: StorageLocation;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ type: MediaImageDto, nullable: true })
  image!: MediaImageDto | null;
}

export class PurchasePreviewProductDto {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ type: MediaImageDto, nullable: true })
  image!: MediaImageDto | null;
}

export class PurchaseSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  purchasedAt!: string;

  @ApiProperty({ type: String, nullable: true })
  storeName!: string | null;

  @ApiProperty()
  itemCount!: number;

  @ApiProperty({ example: 1299 })
  totalPriceMinor!: number;

  @ApiProperty({ example: 'PLN' })
  currency!: string;

  @ApiProperty({ type: [PurchasePreviewProductDto] })
  previewProducts!: PurchasePreviewProductDto[];
}

export class PurchaseDetailDto extends PurchaseSummaryDto {
  @ApiProperty({ type: [PurchaseLineItemDto] })
  lines!: PurchaseLineItemDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
