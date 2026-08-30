import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  type PaginatedMeta,
} from './pagination';

export class ListPaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: DEFAULT_LIST_LIMIT,
    minimum: 1,
    maximum: MAX_LIST_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIST_LIMIT)
  limit?: number = DEFAULT_LIST_LIMIT;
}

export class PaginatedMetaDto implements PaginatedMeta {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  limit!: number;

  @ApiProperty({ example: 250 })
  total!: number;

  @ApiProperty({ example: 5 })
  pageCount!: number;
}
