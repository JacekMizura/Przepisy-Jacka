import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  RecipeDifficulty,
  RecipeIngredientUnit,
  RecipeVisibility,
} from '../../generated/prisma/client';
import { MediaImageDto } from '../../media/dto/media.dto';
import { isPresentOptional } from '../../stock/dto/product.dto';
import { RecipeCategoryRefDto } from './recipe-category.dto';

export class RecipeIngredientGroupInputDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Stabilny identyfikator grupy w payloadzie (nowy albo istniejący). Składniki wskazują go przez groupId.',
  })
  @IsUUID()
  id!: string;

  @ApiProperty({ example: 'Ciasto' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class RecipeIngredientInputDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Opcjonalny istniejący identyfikator składnika — zachowuje powiązania przy edycji.',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUUID()
  id?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Id grupy z tego samego payloadu; null = bez grupy.',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUUID()
  groupId?: string | null;

  @ApiProperty({ example: 'Jajka' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ type: String, example: '2.000', nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MinLength(1)
  quantity?: string | null;

  @ApiProperty({ enum: RecipeIngredientUnit })
  @IsEnum(RecipeIngredientUnit)
  unit!: RecipeIngredientUnit;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(200)
  note?: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUUID()
  productId?: string | null;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class RecipeStepInputDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Opcjonalny istniejący identyfikator kroku — zachowuje zdjęcie przy edycji.',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUUID()
  id?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Przygotowanie makaronu',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @ApiProperty({ example: 'Ugotuj makaron al dente.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  instruction!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Nie mieszaj zbyt długo, żeby masa nie stała się gumowata.',
    description: 'Opcjonalna wskazówka autora pod opisem kroku.',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(1000)
  tip?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 10 })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  @Min(1)
  durationMinutes?: number | null;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  sortOrder!: number;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Identyfikatory składników tego przepisu potrzebne w kroku. Pusta tablica usuwa przypisania. Brak pola przy edycji zachowuje dotychczasowe powiązania istniejącego kroku.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @IsUUID('4', { each: true })
  ingredientIds?: string[];

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Szacowany czas aktywnej pracy w minucie (plan przygotowania).',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  @Min(1)
  activeWorkMinutes?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Czas oczekiwania w minucie (np. pieczenie).',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  @Min(1)
  waitMinutes?: number | null;

  @ApiPropertyOptional({
    description: 'Czy krok ma timer w trybie przygotowania.',
  })
  @IsOptional()
  @IsBoolean()
  timerEnabled?: boolean;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Kroki tego przepisu, które muszą się skończyć przed startem. Pusta tablica usuwa zależności. Brak pola przy edycji zachowuje dotychczasowe powiązania istniejącego kroku.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @IsUUID('4', { each: true })
  dependsOnStepIds?: string[];
}

export class CreateRecipeDto {
  @ApiProperty({ example: 'Makaron z sosem pomidorowym' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  servings!: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  @Min(1)
  prepTimeMinutes?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  @Min(1)
  cookTimeMinutes?: number | null;

  @ApiProperty({ enum: RecipeDifficulty })
  @IsEnum(RecipeDifficulty)
  difficulty!: RecipeDifficulty;

  @ApiPropertyOptional({ type: [String], example: ['obiad', 'wegetariańskie'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    enum: RecipeVisibility,
    default: RecipeVisibility.private,
  })
  @IsOptional()
  @IsEnum(RecipeVisibility)
  visibility?: RecipeVisibility;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Opcjonalne kategorie kuchni przypisane do przepisu.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  sourceUrl?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Autor przepisu ze źródła (oddzielony od użytkownika aplikacji).',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(200)
  sourceAuthor?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Data importu ze źródła zewnętrznego.',
  })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  importedAt?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Klucz idempotencji zapisu importu — ponowne wysłanie zwraca ten sam przepis.',
  })
  @IsOptional()
  @IsUUID()
  importIdempotencyKey?: string;

  @ApiPropertyOptional({
    type: [RecipeIngredientGroupInputDto],
    description: 'Opcjonalne grupy składników. Pusty przepis nie wymaga grup.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientGroupInputDto)
  ingredientGroups?: RecipeIngredientGroupInputDto[];

  @ApiProperty({ type: [RecipeIngredientInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientInputDto)
  ingredients!: RecipeIngredientInputDto[];

  @ApiPropertyOptional({
    description:
      'Włącza nowoczesny tryb przygotowania (/cook). Nie wynika z samego faktu posiadania zależności.',
  })
  @IsOptional()
  @IsBoolean()
  preparationPlanEnabled?: boolean;

  @ApiProperty({ type: [RecipeStepInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeStepInputDto)
  steps!: RecipeStepInputDto[];
}

export class UpdateRecipeDto {
  @ApiPropertyOptional({ example: 'Makaron z sosem pomidorowym' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  servings?: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  @Min(1)
  prepTimeMinutes?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsInt()
  @Min(1)
  cookTimeMinutes?: number | null;

  @ApiPropertyOptional({ enum: RecipeDifficulty })
  @IsOptional()
  @IsEnum(RecipeDifficulty)
  difficulty?: RecipeDifficulty;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: RecipeVisibility })
  @IsOptional()
  @IsEnum(RecipeVisibility)
  visibility?: RecipeVisibility;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Pełna lista kategorii przepisu. Pusta tablica usuwa wszystkie przypisania. Brak pola = bez zmian.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  sourceUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf(isPresentOptional)
  @IsString()
  @MaxLength(200)
  sourceAuthor?: string | null;

  @ApiPropertyOptional({ type: [RecipeIngredientGroupInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientGroupInputDto)
  ingredientGroups?: RecipeIngredientGroupInputDto[];

  @ApiPropertyOptional({ type: [RecipeIngredientInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientInputDto)
  ingredients?: RecipeIngredientInputDto[];

  @ApiPropertyOptional({ type: [RecipeStepInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeStepInputDto)
  steps?: RecipeStepInputDto[];

  @ApiPropertyOptional({
    description: 'Włącza nowoczesny tryb przygotowania (/cook).',
  })
  @IsOptional()
  @IsBoolean()
  preparationPlanEnabled?: boolean;
}

export class RecipeAuthorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class RecipeIngredientGroupDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  sortOrder!: number;
}

export class RecipeIngredientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  groupId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: '2.000' })
  quantity!: string | null;

  @ApiProperty({ enum: RecipeIngredientUnit })
  unit!: RecipeIngredientUnit;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: String, nullable: true })
  productId!: string | null;

  @ApiProperty()
  sortOrder!: number;
}

export class RecipeStepDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  title!: string | null;

  @ApiProperty()
  instruction!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Opcjonalna wskazówka autora.',
  })
  tip!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  durationMinutes!: number | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ type: MediaImageDto, nullable: true })
  image!: MediaImageDto | null;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Składniki jawnie przypisane do tego kroku (kolejność zachowana).',
  })
  ingredientIds!: string[];

  @ApiProperty({ type: Number, nullable: true })
  activeWorkMinutes!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  waitMinutes!: number | null;

  @ApiProperty()
  timerEnabled!: boolean;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Kroki, które muszą się skończyć przed startem tego kroku.',
  })
  dependsOnStepIds!: string[];
}

export class RecipeSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  kitchenId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  servings!: number;

  @ApiProperty({ type: Number, nullable: true })
  prepTimeMinutes!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  cookTimeMinutes!: number | null;

  @ApiProperty({ enum: RecipeDifficulty })
  difficulty!: RecipeDifficulty;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ type: [RecipeCategoryRefDto] })
  categories!: RecipeCategoryRefDto[];

  @ApiProperty({ enum: RecipeVisibility })
  visibility!: RecipeVisibility;

  @ApiProperty({ type: RecipeAuthorDto })
  author!: RecipeAuthorDto;

  @ApiProperty({
    type: MediaImageDto,
    nullable: true,
    description: 'Okładka przepisu; podpisane URL-e wygasają.',
  })
  coverImage!: MediaImageDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    description: 'Czy przepis ma włączony nowoczesny tryb przygotowania.',
  })
  preparationPlanEnabled!: boolean;
}

export class RecipeDetailDto extends RecipeSummaryDto {
  @ApiProperty({ type: String, nullable: true })
  sourceUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Autor ze źródła zewnętrznego (nie użytkownik Mojej Kuchni).',
  })
  sourceAuthor!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Kiedy przepis zaimportowano ze źródła.',
  })
  importedAt!: string | null;

  @ApiProperty({ type: [RecipeIngredientGroupDto] })
  ingredientGroups!: RecipeIngredientGroupDto[];

  @ApiProperty({ type: [RecipeIngredientDto] })
  ingredients!: RecipeIngredientDto[];

  @ApiProperty({ type: [RecipeStepDto] })
  steps!: RecipeStepDto[];
}
