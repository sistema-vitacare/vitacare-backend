import { DomainException } from '@/common/errors/domain.exception';
import { resolveEvolutionPeriod } from '@/modules/Indicator/policies/evolutionPeriod.policy';

const TODAY = '2026-11-06';

const rejection = (period: { from?: string; to?: string }) => {
  try {
    resolveEvolutionPeriod(period, TODAY);
  } catch (error) {
    expect(error).toBeInstanceOf(DomainException);

    const { code, fields } = error as DomainException;

    return {
      status: (error as DomainException).getStatus(),
      code,
      fields: fields?.map((field) => [field.field, field.code]),
    };
  }

  throw new Error('periodo aceito');
};

describe('resolveEvolutionPeriod', () => {
  it('sem datas: os ultimos 30 dias ate hoje, inclusivos', () => {
    expect(resolveEvolutionPeriod({}, TODAY)).toEqual({
      from: '2026-10-08',
      to: TODAY,
    });
  });

  it('so o inicio: termina hoje', () => {
    expect(resolveEvolutionPeriod({ from: '2026-01-01' }, TODAY)).toEqual({
      from: '2026-01-01',
      to: TODAY,
    });
  });

  it('so o fim: comeca 29 dias antes', () => {
    expect(resolveEvolutionPeriod({ to: '2026-03-01' }, TODAY)).toEqual({
      from: '2026-01-31',
      to: '2026-03-01',
    });
  });

  it('aceita 366 dias e recusa 367 com 422 em to', () => {
    expect(
      resolveEvolutionPeriod({ from: '2025-11-06', to: TODAY }, TODAY),
    ).toEqual({ from: '2025-11-06', to: TODAY });
    expect(rejection({ from: '2025-11-05', to: TODAY })).toEqual({
      status: 422,
      code: 'VALIDATION_FAILED',
      fields: [['to', 'PERIOD_TOO_LONG']],
    });
  });

  it('so o inicio ha mais de 366 dias tambem e recusado', () => {
    expect(rejection({ from: '2025-01-01' }).fields).toEqual([
      ['to', 'PERIOD_TOO_LONG'],
    ]);
  });

  it('so o inicio, depois de hoje: 422 em from', () => {
    expect(rejection({ from: '2026-11-07' })).toEqual({
      status: 422,
      code: 'VALIDATION_FAILED',
      fields: [['from', 'AFTER_END']],
    });
  });
});
