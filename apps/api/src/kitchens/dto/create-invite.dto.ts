import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class CreateInviteDto {
  @ApiProperty({ example: 'anna@example.com' })
  @IsEmail()
  email!: string;
}
