import type { DomainException } from '@/common/errors/domain.exception';
import { toPlanTermInput } from '@/modules/Plan/policies/planTerm.policy';

const NOW = new Date('2026-11-03T12:00:00.000Z');

describe('toPlanTermInput', () => {
  it('converte ausentes em sem vencimento e limites do catalogo', () => {
    expect(toPlanTermInput({}, NOW)).toEqual({
      endsAt: null,
      userLimit: null,
      patientLimit: null,
    });
  });

  it('preserva limite zero', () => {
    expect(
      toPlanTermInput({ userLimit: 0, patientLimit: 0 }, NOW),
    ).toMatchObject({ userLimit: 0, patientLimit: 0 });
  });

  it('recusa fim igual ou anterior ao instante atual', () => {
    for (const endsAt of ['2026-11-03T12:00:00Z', '2026-01-01T00:00:00Z']) {
      expect(() => toPlanTermInput({ endsAt }, NOW)).toThrow(
        expect.objectContaining({
          code: 'PLAN_TERM_END_IN_PAST',
        }) as DomainException,
      );
    }
  });

  it('aceita fim futuro', () => {
    expect(
      toPlanTermInput({ endsAt: '2027-01-01T00:00:00-03:00' }, NOW).endsAt,
    ).toEqual(new Date('2027-01-01T03:00:00.000Z'));
  });
});
