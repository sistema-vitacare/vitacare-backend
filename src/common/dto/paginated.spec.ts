import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { paginated } from './paginated.dto';
import { PaginationQueryDto } from './pagination-query.dto';

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

describe('paginated', () => {
  it('calcula o total de paginas', () => {
    const query = plainToInstance(PaginationQueryDto, {
      page: '2',
      limit: '20',
    });

    expect(paginated(['a', 'b'], 45, query)).toEqual({
      items: ['a', 'b'],
      meta: { page: 2, limit: 20, total: 45, totalPages: 3 },
    });
  });

  it('devolve zero paginas quando nao ha resultados', () => {
    const query = plainToInstance(PaginationQueryDto, {});

    expect(paginated([], 0, query).meta.totalPages).toBe(0);
  });
});
