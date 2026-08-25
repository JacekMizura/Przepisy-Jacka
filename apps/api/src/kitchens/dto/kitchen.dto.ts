import { ApiProperty } from '@nestjs/swagger';

export class KitchenMemberDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['owner', 'member'] })
  role!: 'owner' | 'member';

  @ApiProperty({ type: String, format: 'date-time' })
  joinedAt!: string;
}

export class KitchenSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['owner', 'member'] })
  role!: 'owner' | 'member';
}

export class KitchenDetailsDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: [KitchenMemberDto] })
  members!: KitchenMemberDto[];
}

export class InviteCreatedDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({
    description:
      'Jednorazowy link z surowym tokenem. Token nie jest ponownie zwracany.',
  })
  inviteUrl!: string;
}

export class KitchenInviteDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: ['member'] })
  role!: 'member';

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acceptedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt!: string | null;
}
