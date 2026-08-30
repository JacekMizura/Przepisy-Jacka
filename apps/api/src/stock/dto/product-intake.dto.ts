import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  PackageContentUnit,
  ProductPurchaseMode,
  ProductUnit,
  StorageLocation,
} from '../../generated/prisma/client';
import { UpsertProductNutritionDto } from './product-nutrition.dto';
import {
  CreateProductDto,
  EAN_PATTERN,
  isPresentOptional,
  ProductDto,
  ProductPackageFieldsDto,
} from './product.dto';
import { ProductGroupDto } from './product-group.dto';
import { ProductRemovalHintDto } from './product-removal.dto';
import { StockItemDto } from './stock-item.dto';

export class ProductIntakeNewProductDto extends ProductPackageFieldsDto {
  @ApiProperty({ example: 'Mleko' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ProductUnit })
  @IsEnum(ProductUnit)
  defaultUnit!: ProductUnit;

  @ApiPropertyOptional({
    enum: ProductPurchaseMode,
    description:
      'Sposób zakupu: packaged (stałe opakowanie) albo exact (na wagę / luzem). ' +
      'Gdy pominięte — packaged jeśli podano package*, inaczej exact.',
  })
  @IsOptional()
  @IsEnum(ProductPurchaseMode)
  purchaseMode?: ProductPurchaseMode;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @Matches(EAN_PATTERN, {
    message: 'ean musi mieć 8, 12, 13 lub 14 cyfr.',
  })
  ean?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Gotowy MediaAsset (purpose=product) z tej kuchni — bez base64.',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUUID()
  imageMediaId?: string | null;

  @ApiPropertyOptional({
    type: String,
    description:
      'Utwórz nową grupę o tej nazwie w tej samej transakcji (wzajemnie z groupId).',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  createGroupName?: string;
}

export class ProductIntakeStockDto {
  @ApiPropertyOptional({
    type: String,
    example: '1000.000',
    description:
      'Ilość zapasu w defaultUnit produktu. Wymagane dokładnie jedno z: quantity albo packageCount.',
  })
  @IsOptional()
  @ValidateIf(
    (dto: ProductIntakeStockDto) =>
      dto.packageCount === undefined ||
      dto.packageCount === null ||
      dto.packageCount === '',
  )
  @IsString()
  @MinLength(1)
  quantity?: string;

  @ApiPropertyOptional({
    type: String,
    example: '2',
    description:
      'Liczba opakowań — wymaga packageQuantity/packageUnit produktu; wynik w defaultUnit.',
  })
  @IsOptional()
  @ValidateIf(
    (dto: ProductIntakeStockDto) =>
      dto.quantity === undefined ||
      dto.quantity === null ||
      dto.quantity === '',
  )
  @IsString()
  @MinLength(1)
  packageCount?: string;

  @ApiProperty({ enum: StorageLocation, default: StorageLocation.pantry })
  @IsEnum(StorageLocation)
  location!: StorageLocation;

  @ApiPropertyOptional({
    example: 599,
    nullable: true,
    description: 'Łączna cena w groszach; pominięcie / null = nieznana.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  purchasePriceMinor?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(120)
  storeName?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  purchasedAt?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsISO8601()
  expiresAt?: string | null;
}

export class CreateProductIntakeDto {
  @ApiProperty({
    description: 'Klucz idempotencji (UUID lub własny). Unikalny globalnie.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiPropertyOptional({
    type: ProductIntakeNewProductDto,
    description:
      'Nowy produkt — wzajemnie wykluczające się z existingProductId.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductIntakeNewProductDto)
  newProduct?: ProductIntakeNewProductDto;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Istniejący produkt — wzajemnie wykluczające się z newProduct.',
  })
  @IsOptional()
  @IsUUID()
  existingProductId?: string;

  @ApiPropertyOptional({
    description:
      'Gdy istniejący produkt jest w archiwum: przywróć przed dodaniem zapasu.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  restoreArchived?: boolean;

  @ApiPropertyOptional({
    type: UpsertProductNutritionDto,
    description:
      'Wartości odżywcze do zapisu w tej samej transakcji (tylko gdy kompletne).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertProductNutritionDto)
  nutrition?: UpsertProductNutritionDto;

  @ApiPropertyOptional({
    type: ProductIntakeStockDto,
    description: 'Gdy podane — tworzy partię zapasu w tej samej transakcji.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductIntakeStockDto)
  stock?: ProductIntakeStockDto;
}

export class ProductIntakeResultDto {
  @ApiProperty({ type: ProductDto })
  product!: ProductDto;

  @ApiProperty({ type: StockItemDto, nullable: true })
  stockItem!: StockItemDto | null;

  @ApiProperty({
    description: 'true gdy odpowiedź pochodzi z cache idempotencji.',
  })
  replayed!: boolean;

  @ApiProperty({
    description: 'true gdy produkt był przywrócony z archiwum w tym żądaniu.',
  })
  restoredFromArchive!: boolean;

  @ApiProperty({
    type: ProductRemovalHintDto,
    description:
      'Podpowiedź UX: czy wolno cofnąć omyłkowe dodanie (POST …/undo-addition) bez dodatkowego GET.',
  })
  removalHint!: ProductRemovalHintDto;
}

export class ProductMatchQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @Matches(EAN_PATTERN, {
    message: 'ean musi mieć 8, 12, 13 lub 14 cyfr.',
  })
  ean?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}

export class ProductMatchResultDto {
  @ApiProperty({ type: ProductDto, nullable: true })
  exactEan!: ProductDto | null;

  @ApiProperty({ type: ProductDto, nullable: true })
  exactName!: ProductDto | null;

  @ApiProperty({ type: ProductDto, nullable: true })
  archivedMatch!: ProductDto | null;

  @ApiProperty({
    type: [ProductDto],
    description:
      'Sugestie podobnych nazw — nie scalają automatycznie produktów.',
  })
  nameSuggestions!: ProductDto[];

  @ApiProperty({
    type: [ProductGroupDto],
    description: 'Sugestie grup o podobnej nazwie (organizacja katalogu).',
  })
  suggestedGroups!: ProductGroupDto[];

  @ApiProperty({
    example:
      'Ten produkt jest już w katalogu. Możesz odłożyć nową kupioną ilość do zapasów.',
    nullable: true,
  })
  message!: string | null;
}

/** Re-export for OpenAPI discovery alongside CreateProductDto fields. */
export { CreateProductDto, PackageContentUnit };
