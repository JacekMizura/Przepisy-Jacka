import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductUnit } from '../../generated/prisma/client';

export class ProductRemovalPreviewDto {
  @ApiProperty({
    enum: ['undo', 'archive', 'blocked'],
    description:
      'undo = bezpieczne cofnięcie omyłkowego dodania; archive = tylko archiwizacja; blocked = brak bezpiecznej akcji.',
  })
  mode!: 'undo' | 'archive' | 'blocked';

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Polskie wyjaśnienie, gdy mode ≠ undo.',
  })
  reason!: string | null;

  @ApiProperty({
    description: 'true gdy wolno wywołać POST …/undo-addition.',
  })
  canUndo!: boolean;

  @ApiProperty({
    description:
      'true gdy wolno zarchiwizować przez DELETE (bez pending shopping, nie w archiwum).',
  })
  canArchive!: boolean;

  @ApiProperty({
    description:
      'true na ścieżce archiwizacji, gdy pozostały zapas > 0 (najpierw odpis, potem archiwum).',
  })
  canWriteOffAndArchive!: boolean;

  @ApiProperty({
    type: [String],
    description: 'Ludzkie etykiety tego, co undo usunie.',
  })
  willRemove!: string[];

  @ApiProperty({
    type: [String],
    description: 'Ludzkie etykiety tego, co zostanie przy archiwizacji.',
  })
  willKeep!: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '450.000',
    description: 'Suma pozostałych ilości partii; null gdy 0.',
  })
  remainingStockQuantity!: string | null;

  @ApiPropertyOptional({
    enum: ProductUnit,
    nullable: true,
    description: 'Jednostka produktu przy remainingStockQuantity > 0.',
  })
  remainingStockUnit!: ProductUnit | null;
}

export class ProductUndoAdditionResultDto {
  @ApiProperty({ example: true })
  undone!: true;
}

export class ProductRemovalHintDto {
  @ApiProperty({
    description:
      'true gdy zaraz po przyjęciu produkt kwalifikuje się do POST …/undo-addition.',
  })
  canUndo!: boolean;
}
