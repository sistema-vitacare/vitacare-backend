import type { EntityManager } from 'typeorm';

import type { PlanFeature, PlanTermStatus } from '../types/plan.types';

export interface PlanSummary {
  code: string;
  name: string;
  features: PlanFeature[];
  termStatus: PlanTermStatus;
}

interface PlanSummaryRow {
  code: string;
  name: string;
  features: PlanFeature[];
  expired: boolean;
}

/**
 * Codigo, nome, recursos e estado do termo do plano corrente, sem limites, uso
 * nem preco (esses ficam com `plan:read`). Vale a mesma regra de vencimento de
 * `readEffectivePlan`: sem termo corrente, o plano nao esta vencido. `null` para
 * a organizacao de plataforma, que nao tem plano.
 */
export const readPlanSummary = async (
  executor: Pick<EntityManager, 'query'>,
  organizationId: string,
): Promise<PlanSummary | null> => {
  const [row] = await executor.query<PlanSummaryRow[]>(
    `SELECT plan.code,
            plan.name,
            plan.features,
            COALESCE(term.ends_at <= now(), false) AS expired
       FROM organizations o
       JOIN usage_plans plan ON plan.id = o.usage_plan_id
       LEFT JOIN organization_plan_terms term
              ON term.organization_id = o.id
             AND term.superseded_at IS NULL
             AND term.deleted_at IS NULL
      WHERE o.id = $1`,
    [organizationId],
  );

  if (!row) {
    return null;
  }

  return {
    code: row.code,
    name: row.name,
    features: [...row.features],
    termStatus: row.expired ? 'expired' : 'active',
  };
};
