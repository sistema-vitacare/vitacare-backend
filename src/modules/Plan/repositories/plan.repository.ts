import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEventForTarget } from '@/modules/Audit/repositories/auditEvent.repository';

import {
  type TermLimitViolation,
  termLimitViolation,
} from '../policies/planTerm.policy';

import { UsagePlan } from '../entities/usagePlan.entity';
import type {
  OrganizationPlanRow,
  PlanActor,
  PlanChangeRequestFilters,
  PlanChangeRequestRow,
  PlanTermInput,
} from '../types/plan.types';
import { PLAN_SEAT_COUNT } from './planSeat.query';
import { insertPlanTerm } from './planTerm.query';

const SINGLE_PENDING_CONSTRAINT = 'plan_change_requests_single_pending_unique';

export type AssignPlanOutcome =
  | { kind: 'assigned'; plan: OrganizationPlanRow }
  | { kind: 'organization_not_found' | 'plan_not_found' }
  | TermLimitViolation;

export type CreateRequestOutcome =
  | { kind: 'created'; request: PlanChangeRequestRow }
  | { kind: 'plan_not_found' | 'same_plan' | 'already_pending' };

export type DecideRequestOutcome =
  | { kind: 'decided'; request: PlanChangeRequestRow }
  | { kind: 'not_found' | 'not_pending' | 'plan_not_found' }
  | TermLimitViolation;

type TermCheck = { kind: 'plan_not_found' } | TermLimitViolation | null;

export interface ApproveRequestCommand {
  requestId: string;
  term: PlanTermInput;
  decisionNote: string | null;
  actor: PlanActor;
}

const REQUEST_SELECT = `
  SELECT r.id,
         r.organization_id AS "organizationId",
         json_build_object('id', cur.id, 'code', cur.code, 'name', cur.name) AS "currentPlan",
         json_build_object('id', req.id, 'code', req.code, 'name', req.name) AS "requestedPlan",
         r.notes,
         r.status,
         r.requested_by_user_id AS "requestedByUserId",
         r.decided_by_user_id AS "decidedByUserId",
         r.decided_at AS "decidedAt",
         r.decision_note AS "decisionNote",
         r.created_at AS "createdAt"
    FROM plan_change_requests r
    JOIN usage_plans cur ON cur.id = r.current_plan_id
    JOIN usage_plans req ON req.id = r.requested_plan_id`;

const isUniqueViolation = (error: unknown, constraint: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === '23505' &&
  (error as { constraint?: unknown }).constraint === constraint;

/**
 * Plano corrente, vigencias e solicitacoes. Toda escrita trava a organizacao
 * com `FOR NO KEY UPDATE`, a mesma trava do cadastro de usuario: troca de plano
 * e checagem de limite nunca se intercalam.
 */
@Injectable()
export class PlanRepository {
  constructor(private readonly dataSource: DataSource) {}

  async listCatalog(): Promise<UsagePlan[]> {
    try {
      return await this.dataSource.manager
        .createQueryBuilder(UsagePlan, 'plan')
        .where('plan.status = true')
        .andWhere('plan.deleted_at IS NULL')
        .orderBy('plan.user_limit', 'ASC')
        .addOrderBy('plan.name', 'ASC')
        .getMany();
    } catch (error) {
      throw translatePgError(error, 'usage_plans');
    }
  }

  async findOrganizationPlan(
    organizationId: string,
  ): Promise<OrganizationPlanRow | null> {
    try {
      return await this.readOrganizationPlan(
        this.dataSource.manager,
        organizationId,
      );
    } catch (error) {
      throw translatePgError(error, 'organization_plan_terms');
    }
  }

  async assign(
    organizationId: string,
    usagePlanId: string,
    term: PlanTermInput,
    reason: string | null,
    actor: PlanActor,
  ): Promise<AssignPlanOutcome> {
    return this.write(async (manager) => {
      if (!(await this.lockTenantOrganization(manager, organizationId))) {
        return { kind: 'organization_not_found' };
      }

      const rejected = await this.checkTerm(manager, usagePlanId, term);

      if (rejected) {
        return rejected;
      }

      const termId = await insertPlanTerm(manager, {
        organizationId,
        usagePlanId,
        origin: 'assignment',
        changeRequestId: null,
        reason,
        assignedByUserId: actor.userId,
        term,
      });

      await insertAuditEventForTarget(manager, actor, {
        organizationId,
        action: 'plan.assigned',
        entityType: 'organization_plan_term',
        entityId: termId,
        afterValues: this.termAudit(usagePlanId, term),
      });

      return {
        kind: 'assigned',
        plan: (await this.readOrganizationPlan(manager, organizationId))!,
      };
    });
  }

  async listRequests(
    filters: PlanChangeRequestFilters,
  ): Promise<[PlanChangeRequestRow[], number]> {
    const conditions = ['r.deleted_at IS NULL'];
    const parameters: unknown[] = [];

    if (filters.organizationId) {
      parameters.push(filters.organizationId);
      conditions.push(`r.organization_id = $${parameters.length}`);
    }

    if (filters.status) {
      parameters.push(filters.status);
      conditions.push(`r.status = $${parameters.length}`);
    }

    const where = conditions.join(' AND ');

    try {
      const [rows, [{ total }]] = await Promise.all([
        this.dataSource.query<PlanChangeRequestRow[]>(
          `${REQUEST_SELECT}
            WHERE ${where}
            ORDER BY r.created_at DESC, r.id
            LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
          [...parameters, filters.take, filters.skip],
        ),
        this.dataSource.query<Array<{ total: number }>>(
          `SELECT count(*)::int AS total FROM plan_change_requests r WHERE ${where}`,
          parameters,
        ),
      ]);

      return [rows, total];
    } catch (error) {
      throw translatePgError(error, 'plan_change_requests');
    }
  }

  async createRequest(
    organizationId: string,
    requestedPlanId: string,
    notes: string | null,
    actor: PlanActor,
  ): Promise<CreateRequestOutcome> {
    try {
      return await this.write(async (manager) => {
        const current = await this.readOrganizationPlan(
          manager,
          organizationId,
          true,
        );

        if (!current) {
          throw new Error('Organizacao da sessao sem plano corrente.');
        }

        if (!(await this.isPlanAvailable(manager, requestedPlanId))) {
          return { kind: 'plan_not_found' };
        }

        if (requestedPlanId === current.plan.id && !current.term.expired) {
          return { kind: 'same_plan' };
        }

        const [{ id }] = await manager.query<Array<{ id: string }>>(
          `INSERT INTO plan_change_requests
             (organization_id, current_plan_id, requested_plan_id, notes, requested_by_user_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            organizationId,
            current.plan.id,
            requestedPlanId,
            notes,
            actor.userId,
          ],
        );

        await insertAuditEventForTarget(manager, actor, {
          organizationId,
          action: 'plan_change_request.created',
          entityType: 'plan_change_request',
          entityId: id,
          afterValues: { requestedPlanId },
        });

        return {
          kind: 'created',
          request: (await this.readRequest(manager, id))!,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error, SINGLE_PENDING_CONSTRAINT)) {
        return { kind: 'already_pending' };
      }

      throw error;
    }
  }

  async cancelRequest(
    organizationId: string,
    requestId: string,
    actor: PlanActor,
  ): Promise<DecideRequestOutcome> {
    return this.decide(requestId, organizationId, actor, async (manager) => {
      await this.closeRequest(manager, requestId, 'cancelled', null, actor);

      return 'plan_change_request.cancelled';
    });
  }

  async rejectRequest(
    requestId: string,
    decisionNote: string,
    actor: PlanActor,
  ): Promise<DecideRequestOutcome> {
    return this.decide(requestId, undefined, actor, async (manager) => {
      await this.closeRequest(
        manager,
        requestId,
        'rejected',
        decisionNote,
        actor,
      );

      return 'plan_change_request.rejected';
    });
  }

  async approveRequest(
    command: ApproveRequestCommand,
  ): Promise<DecideRequestOutcome> {
    const { requestId, term, decisionNote, actor } = command;

    return this.decide(
      requestId,
      undefined,
      actor,
      async (manager, request) => {
        const rejected = await this.checkTerm(
          manager,
          request.requestedPlan.id,
          term,
        );

        if (rejected) {
          return rejected;
        }

        const termId = await insertPlanTerm(manager, {
          organizationId: request.organizationId,
          usagePlanId: request.requestedPlan.id,
          origin: 'change_request',
          changeRequestId: requestId,
          reason: decisionNote,
          assignedByUserId: actor.userId,
          term,
        });

        await this.closeRequest(
          manager,
          requestId,
          'approved',
          decisionNote,
          actor,
        );

        await insertAuditEventForTarget(manager, actor, {
          organizationId: request.organizationId,
          action: 'plan.assigned',
          entityType: 'organization_plan_term',
          entityId: termId,
          afterValues: {
            ...this.termAudit(request.requestedPlan.id, term),
            changeRequestId: requestId,
          },
        });

        return 'plan_change_request.approved';
      },
    );
  }

  /**
   * Trava organizacao e solicitacao, nessa ordem (a mesma do cadastro), exige
   * `pending` e audita a decisao. `organizationId` restringe ao tenant da
   * sessao; sem ele, a plataforma alcanca qualquer solicitacao. `apply`
   * devolve a acao auditada, ou a recusa do termo (plano fora do catalogo ou
   * limite fora da regra do plano), sem gravar nada.
   */
  private async decide(
    requestId: string,
    organizationId: string | undefined,
    actor: PlanActor,
    apply: (
      manager: EntityManager,
      request: PlanChangeRequestRow,
    ) => Promise<string | NonNullable<TermCheck>>,
  ): Promise<DecideRequestOutcome> {
    return this.write(async (manager) => {
      const found = await this.readRequest(manager, requestId);

      if (
        !found ||
        (organizationId !== undefined &&
          found.organizationId !== organizationId)
      ) {
        return { kind: 'not_found' };
      }

      await this.lockTenantOrganization(manager, found.organizationId);

      const [locked] = await manager.query<Array<{ status: string }>>(
        `SELECT status FROM plan_change_requests WHERE id = $1 FOR UPDATE`,
        [requestId],
      );

      if (locked.status !== 'pending') {
        return { kind: 'not_pending' };
      }

      const action = await apply(manager, found);

      if (typeof action !== 'string') {
        return action;
      }

      await insertAuditEventForTarget(manager, actor, {
        organizationId: found.organizationId,
        action,
        entityType: 'plan_change_request',
        entityId: requestId,
        afterValues: { requestedPlanId: found.requestedPlan.id },
      });

      return {
        kind: 'decided',
        request: (await this.readRequest(manager, requestId))!,
      };
    });
  }

  private async closeRequest(
    manager: EntityManager,
    requestId: string,
    status: 'approved' | 'rejected' | 'cancelled',
    decisionNote: string | null,
    actor: PlanActor,
  ): Promise<void> {
    await manager.query(
      `UPDATE plan_change_requests
          SET status = $2,
              decision_note = $3,
              decided_by_user_id = $4,
              decided_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [requestId, status, decisionNote, actor.userId],
    );
  }

  private async readRequest(
    manager: EntityManager,
    requestId: string,
  ): Promise<PlanChangeRequestRow | null> {
    const [row] = await manager.query<PlanChangeRequestRow[]>(
      `${REQUEST_SELECT} WHERE r.id = $1 AND r.deleted_at IS NULL`,
      [requestId],
    );

    return row ?? null;
  }

  /** Inclui a organizacao inativa: o plano dela continua consultavel. */
  private async lockTenantOrganization(
    manager: EntityManager,
    organizationId: string,
  ): Promise<boolean> {
    const rows = await manager.query<unknown[]>(
      `SELECT id FROM organizations
        WHERE id = $1 AND kind = 'tenant'
        FOR NO KEY UPDATE`,
      [organizationId],
    );

    return rows.length === 1;
  }

  /** Plano disponivel e limites conforme a regra dele (Quadro 2). */
  private async checkTerm(
    manager: EntityManager,
    usagePlanId: string,
    term: PlanTermInput,
  ): Promise<TermCheck> {
    const [plan] = await manager.query<
      Array<{ userLimit: number; patientLimit: number; expandable: boolean }>
    >(
      `SELECT user_limit AS "userLimit",
              patient_limit AS "patientLimit",
              expandable
         FROM usage_plans
        WHERE id = $1 AND status = true AND deleted_at IS NULL`,
      [usagePlanId],
    );

    if (!plan) {
      return { kind: 'plan_not_found' };
    }

    return termLimitViolation(plan, term);
  }

  private async isPlanAvailable(
    manager: EntityManager,
    usagePlanId: string,
  ): Promise<boolean> {
    const rows = await manager.query<unknown[]>(
      `SELECT id FROM usage_plans
        WHERE id = $1 AND status = true AND deleted_at IS NULL`,
      [usagePlanId],
    );

    return rows.length === 1;
  }

  private async readOrganizationPlan(
    manager: EntityManager,
    organizationId: string,
    lock = false,
  ): Promise<OrganizationPlanRow | null> {
    if (lock && !(await this.lockTenantOrganization(manager, organizationId))) {
      return null;
    }

    const [row] = await manager.query<OrganizationPlanRow[]>(
      `SELECT o.id AS "organizationId",
              json_build_object(
                'id', plan.id,
                'code', plan.code,
                'name', plan.name,
                'description', plan.description,
                'userLimit', plan.user_limit,
                'patientLimit', plan.patient_limit,
                'features', plan.features,
                'monthlyPrice', plan.monthly_price::text,
                'expandable', plan.expandable
              ) AS plan,
              json_build_object(
                'id', term.id,
                'startsAt', term.starts_at,
                'endsAt', term.ends_at,
                'userLimit', term.user_limit,
                'patientLimit', term.patient_limit,
                'origin', term.origin,
                'expired', COALESCE(term.ends_at <= now(), false)
              ) AS term,
              json_build_object(
                'users', (${PLAN_SEAT_COUNT.users})
              ) AS usage
         FROM organizations o
         JOIN usage_plans plan ON plan.id = o.usage_plan_id
         JOIN organization_plan_terms term
           ON term.organization_id = o.id
          AND term.superseded_at IS NULL
          AND term.deleted_at IS NULL
        WHERE o.id = $1
          AND o.kind = 'tenant'`,
      [organizationId],
    );

    if (!row) {
      return null;
    }

    // json_build_object devolve datas como texto ISO.
    return {
      ...row,
      term: {
        ...row.term,
        startsAt: new Date(row.term.startsAt),
        endsAt: row.term.endsAt ? new Date(row.term.endsAt) : null,
      },
    };
  }

  private termAudit(
    usagePlanId: string,
    term: PlanTermInput,
  ): Record<string, unknown> {
    return {
      usagePlanId,
      endsAt: term.endsAt?.toISOString() ?? null,
      userLimit: term.userLimit,
      patientLimit: term.patientLimit,
    };
  }

  private async write<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (error) {
      if (isUniqueViolation(error, SINGLE_PENDING_CONSTRAINT)) {
        throw error;
      }

      throw translatePgError(error, 'plan_change_requests');
    }
  }
}
