import type { EntityManager } from 'typeorm';

import type { PlanTermInput, PlanTermOrigin } from '../types/plan.types';

export interface EffectivePlan {
  userLimit: number;
  patientLimit: number;
  expired: boolean;
}

/**
 * Limite efetivo (personalizado do termo corrente, senao o do catalogo) e
 * vencimento. Quem decide cadastro chama dentro da transacao que ja trava a
 * organizacao, para nao correr com uma troca de plano. `null` para a
 * organizacao de plataforma, que nao tem plano.
 */
export const readEffectivePlan = async (
  manager: EntityManager,
  organizationId: string,
): Promise<EffectivePlan | null> => {
  const [row] = await manager.query<EffectivePlan[]>(
    `SELECT COALESCE(term.user_limit, plan.user_limit) AS "userLimit",
            COALESCE(term.patient_limit, plan.patient_limit) AS "patientLimit",
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

  return row ?? null;
};

export interface NewPlanTerm {
  organizationId: string;
  usagePlanId: string;
  origin: PlanTermOrigin;
  changeRequestId: string | null;
  reason: string | null;
  assignedByUserId: string | null;
  term: PlanTermInput;
}

/**
 * Encerra o termo corrente e abre o novo, mantendo `organizations.usage_plan_id`
 * no plano corrente. Exige a organizacao travada pelo chamador.
 */
export const insertPlanTerm = async (
  manager: EntityManager,
  input: NewPlanTerm,
): Promise<string> => {
  await manager.query(
    `UPDATE organization_plan_terms
        SET superseded_at = now(), updated_at = now()
      WHERE organization_id = $1
        AND superseded_at IS NULL
        AND deleted_at IS NULL`,
    [input.organizationId],
  );

  const [{ id }] = await manager.query<Array<{ id: string }>>(
    `INSERT INTO organization_plan_terms
       (organization_id, usage_plan_id, ends_at, user_limit, patient_limit,
        origin, change_request_id, reason, assigned_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.organizationId,
      input.usagePlanId,
      input.term.endsAt,
      input.term.userLimit,
      input.term.patientLimit,
      input.origin,
      input.changeRequestId,
      input.reason,
      input.assignedByUserId,
    ],
  );

  await manager.query(
    `UPDATE organizations
        SET usage_plan_id = $2, updated_at = now()
      WHERE id = $1
        AND usage_plan_id IS DISTINCT FROM $2`,
    [input.organizationId, input.usagePlanId],
  );

  return id;
};
