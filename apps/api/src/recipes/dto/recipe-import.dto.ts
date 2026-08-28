import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { RecipeIngredientUnit } from '../../generated/prisma/client';

export class PreviewRecipeImportDto {
  @ApiPropertyOptional({
    enum: ['url', 'text'],
    default: 'url',
    description: 'Tryb importu: link albo wklejony tekst.',
  })
  @IsOptional()
  @IsIn(['url', 'text'])
  mode?: 'url' | 'text';

  @ApiPropertyOptional({ example: 'https://example.com/przepis' })
  @ValidateIf((dto: PreviewRecipeImportDto) => (dto.mode ?? 'url') === 'url')
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({
    description: 'Wklejony tekst przepisu (tryb text).',
  })
  @ValidateIf((dto: PreviewRecipeImportDto) => dto.mode === 'text')
  @IsString()
  @MaxLength(100_000)
  text?: string;

  @ApiPropertyOptional({
    description: 'Opcjonalny adres źródła przy imporcie tekstu.',
    type: String,
    nullable: true,
    example: 'https://www.instagram.com/p/example/',
  })
  @IsOptional()
  @ValidateIf(
    (dto: PreviewRecipeImportDto) =>
      dto.sourceUrl !== undefined &&
      dto.sourceUrl !== null &&
      dto.sourceUrl !== '',
  )
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2048)
  sourceUrl?: string | null;
}

export class ImportedIngredientPreviewDto {
  @ApiProperty()
  rawText!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  quantity!: string | null;

  @ApiProperty({ enum: RecipeIngredientUnit, nullable: true })
  unit!: RecipeIngredientUnit | null;

  @ApiProperty({ enum: ['exact', 'ambiguous', 'none'] })
  confidence!: 'exact' | 'ambiguous' | 'none';

  @ApiProperty({ type: String, nullable: true })
  suggestedProductId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  suggestedProductName!: string | null;

  @ApiProperty({ type: [String] })
  warnings!: string[];
}

export class ImportedStepPreviewDto {
  @ApiProperty({ type: String, nullable: true })
  title!: string | null;

  @ApiProperty()
  instruction!: string;

  @ApiProperty({ type: String, nullable: true })
  tip!: string | null;

  @ApiProperty()
  sortOrder!: number;
}

export class ImportedRecipeCandidateDto {
  @ApiProperty()
  index!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  servings!: number | null;

  @ApiProperty({ type: String, nullable: true })
  servingsRaw!: string | null;

  @ApiProperty()
  servingsAmbiguous!: boolean;

  @ApiProperty({ type: Number, nullable: true })
  prepTimeMinutes!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  cookTimeMinutes!: number | null;

  @ApiProperty({ type: String, nullable: true })
  sourceAuthor!: string | null;

  @ApiProperty({ type: [String] })
  sourceCategories!: string[];

  @ApiProperty({ type: [String] })
  suggestedCategoryIds!: string[];

  @ApiProperty({ type: [String] })
  unmatchedSourceCategories!: string[];

  @ApiProperty({ type: [ImportedIngredientPreviewDto] })
  ingredients!: ImportedIngredientPreviewDto[];

  @ApiProperty({ type: [ImportedStepPreviewDto] })
  steps!: ImportedStepPreviewDto[];

  @ApiProperty({ type: [String] })
  warnings!: string[];

  @ApiProperty({ type: [String] })
  gaps!: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Fragmenty tekstu nierozpoznane jako składniki/kroki — do ręcznego opracowania.',
  })
  unassignedFragments?: string[];
}

export class ExistingSourceRecipeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class RecipeImportPreviewDto {
  @ApiProperty({ type: String, nullable: true })
  sourceUrl!: string | null;

  @ApiProperty()
  importIdempotencyKey!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  importedAt!: string;

  @ApiProperty({
    enum: [
      'jsonld',
      'microdata',
      'rdfa',
      'site:aniagotuje',
      'html',
      'pasted_text',
    ],
    nullable: true,
  })
  extractionMethod!: string | null;

  @ApiProperty({
    description:
      'true = automatyczny import z linku; false = tekst wklejony przez użytkownika.',
  })
  fromUrlFetch!: boolean;

  @ApiPropertyOptional({
    description:
      'Gdy automatyczny odczyt z Instagrama/TikToka nie wystarczył — zaproponuj wklejenie opisu.',
  })
  suggestPasteCaption!: boolean;

  @ApiProperty({ type: [ImportedRecipeCandidateDto] })
  candidates!: ImportedRecipeCandidateDto[];

  @ApiProperty({ type: [ExistingSourceRecipeDto] })
  existingFromSameSource!: ExistingSourceRecipeDto[];
}
