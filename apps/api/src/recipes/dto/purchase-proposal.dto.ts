import { ApiProperty } from '@nestjs/swagger';

import { ProductUnit, ShoppingInputUnit } from '../../generated/prisma/client';

export class PurchaseProposalAlternativeDto {
  @ApiProperty()
  purchaseOptionId!: string;

  @ApiProperty()
  purchaseOptionName!: string;

  @ApiProperty()
  packageCount!: number;

  @ApiProperty({ type: String, example: '1000.000' })
  packageContentQuantity!: string;

  @ApiProperty({ enum: ProductUnit })
  packageContentUnit!: ProductUnit;

  @ApiProperty({ type: String, example: '1000.000' })
  totalPurchaseQuantity!: string;

  @ApiProperty({ enum: ShoppingInputUnit })
  totalPurchaseUnit!: ShoppingInputUnit;
}

export class PurchaseProposalDto {
  @ApiProperty({ enum: ['packages', 'exact'] })
  mode!: 'packages' | 'exact';

  @ApiProperty({ type: String, nullable: true })
  purchaseOptionId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  purchaseOptionName!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  packageCount!: number | null;

  @ApiProperty({ type: String, nullable: true, example: '1000.000' })
  packageContentQuantity!: string | null;

  @ApiProperty({ enum: ProductUnit, nullable: true })
  packageContentUnit!: ProductUnit | null;

  @ApiProperty({ type: String, example: '1000.000' })
  totalPurchaseQuantity!: string;

  @ApiProperty({ enum: ShoppingInputUnit })
  totalPurchaseUnit!: ShoppingInputUnit;

  @ApiProperty({ type: [PurchaseProposalAlternativeDto] })
  alternatives!: PurchaseProposalAlternativeDto[];
}
