import type { DomainException } from '@/common/errors/domain.exception';
import {
  termLimitViolation,
  toPlanTermInput,
} from '@/modules/Plan/policies/planTerm.policy';

const NOW = new Date('2026-11-03T12:00:00.000Z');

describe('toPlanTermInput', () => {
  it('converte ausentes em sem vencimento e limites do catalogo', () => {
    expect(toPlanTermInput({}, NOW)).toEqual({
      endsAt: null,
      userLimit: null,
      patientLimit: null,
    });
  });

  it('preserva limite zero na conversao', () => {
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

describe('termLimitViolation (Quadro 2 do TCC)', () => {
  const basic = { userLimit: 10, patientLimit: 200, expandable: false };
  const enterprise = { userLimit: 50, patientLimit: 1000, expandable: true };
  const term = (userLimit: number | null, patientLimit: number | null) => ({
    endsAt: null,
    userLimit,
    patientLimit,
  });

  it('aceita qualquer plano sem limite personalizado', () => {
    expect(termLimitViolation(basic, term(null, null))).toBeNull();
    expect(termLimitViolation(enterprise, term(null, null))).toBeNull();
  });

  it('recusa limite personalizado em plano sem expansao', () => {
    expect(termLimitViolation(basic, term(20, null))).toEqual({
      kind: 'limit_not_expandable',
      field: 'userLimit',
    });
    expect(termLimitViolation(basic, term(null, 300))).toEqual({
      kind: 'limit_not_expandable',
      field: 'patientLimit',
    });
  });

  it('recusa expansao abaixo do limite do catalogo, inclusive zero', () => {
    expect(termLimitViolation(enterprise, term(49, null))).toEqual({
      kind: 'limit_below_plan',
      field: 'userLimit',
    });
    expect(termLimitViolation(enterprise, term(60, 0))).toEqual({
      kind: 'limit_below_plan',
      field: 'patientLimit',
    });
  });

  it('aceita expansao igual ou acima do catalogo', () => {
    expect(termLimitViolation(enterprise, term(50, 1000))).toBeNull();
    expect(termLimitViolation(enterprise, term(80, 1500))).toBeNull();
  });
});
