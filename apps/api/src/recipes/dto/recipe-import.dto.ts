import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, MaxLength } from 'class-validator';

import { RecipeIngredientUnit } from '../../generated/prisma/client';

export class PreviewRecipeImportDto {
  @ApiProperty({ example: 'https://example.com/przepis' })
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2048)
  url!: string;
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
}

export class ExistingSourceRecipeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class RecipeImportPreviewDto {
  @ApiProperty()
  sourceUrl!: string;

  @ApiProperty()
  importIdempotencyKey!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  importedAt!: string;

  @ApiProperty({ type: [ImportedRecipeCandidateDto] })
  candidates!: ImportedRecipeCandidateDto[];

  @ApiProperty({ type: [ExistingSourceRecipeDto] })
  existingFromSameSource!: ExistingSourceRecipeDto[];
}
