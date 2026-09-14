import { ApiProperty } from '@nestjs/swagger';
import { PaginationQueryDto } from './pagination-query.dto';

export class PaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class PaginatedDto<T> {
  items!: T[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Monta o envelope paginado a partir do resultado de um findAndCount. */
export const paginated = <T>(
  items: T[],
  total: number,
  query: PaginationQueryDto,
): PaginatedDto<T> => ({
  items,
  meta: {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
  },
});
