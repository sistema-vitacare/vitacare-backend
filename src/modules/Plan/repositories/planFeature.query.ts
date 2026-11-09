import type { EntityManager } from 'typeorm';

import type { PlanFeature } from '../types/plan.types';

/**
 * Recurso do plano corrente da organizacao (Quadro 2). Vencimento nao tira o
 * recurso: pela politica do BE-07, o termo vencido so bloqueia crescimento.
 */
export const hasPlanFeature = async (
  manager: EntityManager,
  organizationId: string,
  feature: PlanFeature,
): Promise<boolean> => {
  const rows = await manager.query<unknown[]>(
    `SELECT 1
       FROM organizations o
       JOIN usage_plans plan ON plan.id = o.usage_plan_id
      WHERE o.id = $1
        AND $2 = ANY (plan.features)`,
    [organizationId, feature],
  );

  return rows.length === 1;
};
