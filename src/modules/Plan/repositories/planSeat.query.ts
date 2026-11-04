import type { EntityManager } from 'typeorm';

import { readEffectivePlan } from './planTerm.query';

/** Recursos com vaga no plano. Pacientes (ativos) entram com o BE-09. */
export type PlanSeatResource = 'users';

export type PlanSeatRefusal = 'plan_expired' | 'limit_reached';

/**
 * Quem ocupa vaga, filtrado por `$1` (organizacao). A consulta de consumo usa
 * o mesmo SQL, para o uso exibido nunca divergir do aplicado.
 */
export const PLAN_SEAT_COUNT: Record<PlanSeatResource, string> = {
  users: `SELECT count(*)::int FROM users
           WHERE organization_id = $1
             AND status IN ('pending', 'active')`,
};

const LIMIT_FIELD = { users: 'userLimit' } as const;

/**
 * Vencimento bloqueia crescimento (BE-07); o limite e o efetivo do termo
 * corrente. Limite abaixo do uso so impede crescer, ninguem e inativado. O
 * chamador trava a organizacao (`FOR NO KEY UPDATE`) na mesma transacao, o que
 * serializa cadastros e reativacoes concorrentes. A plataforma nao tem plano.
 */
export const checkPlanSeat = async (
  manager: EntityManager,
  organizationId: string,
  resource: PlanSeatResource,
): Promise<PlanSeatRefusal | null> => {
  const plan = await readEffectivePlan(manager, organizationId);

  if (!plan) return 'limit_reached';
  if (plan.expired) return 'plan_expired';

  const [{ occupied }] = await manager.query<Array<{ occupied: number }>>(
    `SELECT (${PLAN_SEAT_COUNT[resource]}) AS occupied`,
    [organizationId],
  );

  return occupied < plan[LIMIT_FIELD[resource]] ? null : 'limit_reached';
};
