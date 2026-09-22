import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';

describe('PaginationQueryDto', () => {
  const parse = (query: Record<string, unknown>): PaginationQueryDto =>
    plainToInstance(PaginationQueryDto, query);

  it('converte strings de querystring em numeros', () => {
    const dto = parse({ page: '3', limit: '50' });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
    expect(dto.skip).toBe(100);
  });

  it('aplica os valores padrao', () => {
    const dto = parse({});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.skip).toBe(0);
  });

  it('rejeita limite acima do maximo', () => {
    expect(validateSync(parse({ limit: '500' }))).not.toHaveLength(0);
  });

  it('rejeita pagina zero', () => {
    expect(validateSync(parse({ page: '0' }))).not.toHaveLength(0);
  });
});
