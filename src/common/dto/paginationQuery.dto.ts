import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'A pagina deve ser um numero inteiro.' })
  @Min(1, { message: 'A pagina deve ser maior ou igual a 1.' })
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'O limite deve ser um numero inteiro.' })
  @Min(1, { message: 'O limite deve ser maior ou igual a 1.' })
  @Max(100, { message: 'O limite maximo por pagina e 100.' })
  limit: number = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
