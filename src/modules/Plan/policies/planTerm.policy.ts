import { DomainException } from '@/common/errors/domain.exception';

import type { PlanTermFieldsDto } from '../dtos/planTermFields.dto';
import { PlanErrors } from '../plan.errors';
import type { PlanTermInput } from '../types/plan.types';

export type TermLimitField = 'userLimit' | 'patientLimit';

export interface TermLimitViolation {
  kind: 'limit_not_expandable' | 'limit_below_plan';
  field: TermLimitField;
}

/**
 * Quadro 2 do TCC: Basic tem limite fixo; Enterprise admite expansao conforme
 * contratacao, nunca reducao. Limite omitido vale o do catalogo.
 */
export const termLimitViolation = (
  plan: { userLimit: number; patientLimit: number; expandable: boolean },
  term: PlanTermInput,
): TermLimitViolation | null => {
  for (const field of ['userLimit', 'patientLimit'] as const) {
    const custom = term[field];

    if (custom === null) continue;
    if (!plan.expandable) return { kind: 'limit_not_expandable', field };
    if (custom < plan[field]) return { kind: 'limit_below_plan', field };
  }

  return null;
};

/** Fim no passado abriria um termo ja vencido: recusado antes do banco. */
export const toPlanTermInput = (
  fields: PlanTermFieldsDto,
  now: Date = new Date(),
): PlanTermInput => {
  const endsAt = fields.endsAt ? new Date(fields.endsAt) : null;

  if (endsAt && endsAt.getTime() <= now.getTime()) {
    throw new DomainException({
      ...PlanErrors.END_IN_PAST,
      detail: 'endsAt anterior ou igual ao instante atual.',
      fields: [{ field: 'endsAt', code: 'IN_PAST' }],
    });
  }

  return {
    endsAt,
    userLimit: fields.userLimit ?? null,
    patientLimit: fields.patientLimit ?? null,
  };
};

/** Erro de dominio da recusa do limite, comum a atribuicao e aprovacao. */
export const toTermLimitException = (
  violation: TermLimitViolation,
): DomainException =>
  violation.kind === 'limit_not_expandable'
    ? new DomainException({
        ...PlanErrors.LIMIT_NOT_EXPANDABLE,
        detail: `${violation.field} informado para plano sem expansao.`,
        fields: [{ field: violation.field, code: 'NOT_EXPANDABLE' }],
      })
    : new DomainException({
        ...PlanErrors.LIMIT_BELOW_CATALOG,
        detail: `${violation.field} menor que o limite do catalogo.`,
        fields: [{ field: violation.field, code: 'BELOW_CATALOG' }],
      });
