import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'], example: 'ok', type: String })
  status!: 'ok';

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-08-24T21:54:00.000Z',
  })
  timestamp!: string;
}
