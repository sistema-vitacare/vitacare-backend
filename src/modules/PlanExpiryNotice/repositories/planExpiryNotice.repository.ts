import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';

import type {
  ExpiringTerm,
  NoticeMilestone,
} from '../types/planExpiryNotice.types';

/**
 * Geracao dos avisos de vencimento (BE-28). Job de sistema, sem sessao: cada
 * consulta filtra pela organizacao do proprio termo, e os destinatarios sao
 * so os administradores ativos dela.
 */
@Injectable()
export class PlanExpiryNoticeRepository {
  constructor(private readonly dataSource: DataSource) {}

  async now(): Promise<Date> {
    const [row] = await this.dataSource.query<Array<{ now: Date }>>(
      'SELECT now() AS now',
    );

    return row.now;
  }

  /**
   * Termos correntes com fim ate 8 dias depois da `reference`, de organizacao
   * cliente ativa, abertos ate a `reference` (termo novo espera a 08:00
   * seguinte) e ainda sem o aviso de vencimento, o ultimo marco.
   */
  async listCandidates(reference: Date): Promise<ExpiringTerm[]> {
    return this.dataSource.query<ExpiringTerm[]>(
      `SELECT term.id AS "termId", term.organization_id AS "organizationId",
              term.ends_at AS "endsAt"
         FROM organization_plan_terms term
         JOIN organizations o
           ON o.id = term.organization_id
          AND o.kind = 'tenant'
          AND o.status = 'active'
        WHERE term.superseded_at IS NULL
          AND term.deleted_at IS NULL
          AND term.ends_at IS NOT NULL
          AND term.ends_at <= $1::timestamptz + interval '8 days'
          AND term.created_at <= $1
          AND NOT EXISTS (
                SELECT 1 FROM plan_expiry_notices n
                 WHERE n.plan_term_id = term.id
                   AND n.milestone = 'expired')
        ORDER BY term.ends_at, term.id`,
      [reference],
    );
  }

  /**
   * Grava o aviso do marco, um e-mail pendente por administrador ativo e a
   * auditoria, numa transacao. O termo e travado (`FOR SHARE`) e reconferido:
   * uma renovacao em curso espera ou ja o substituiu. Aviso repetido (outra
   * execucao, outro worker) nao entra: `null`.
   */
  async generate(
    term: ExpiringTerm,
    notice: NoticeMilestone,
  ): Promise<{ noticeId: string; recipients: number } | null> {
    return this.dataSource.transaction(async (manager) => {
      const current = await manager.query<unknown[]>(
        `SELECT 1
           FROM organization_plan_terms term
           JOIN organizations o
             ON o.id = term.organization_id
            AND o.kind = 'tenant'
            AND o.status = 'active'
          WHERE term.id = $1
            AND term.organization_id = $2
            AND term.superseded_at IS NULL
            AND term.deleted_at IS NULL
            FOR SHARE OF term`,
        [term.termId, term.organizationId],
      );

      if (current.length === 0) return null;

      const [inserted] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO plan_expiry_notices
           (organization_id, plan_term_id, milestone, term_ends_at, due_at, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (plan_term_id, milestone) DO NOTHING
         RETURNING id`,
        [
          term.organizationId,
          term.termId,
          notice.milestone,
          term.endsAt,
          notice.dueAt,
          notice.validUntil,
        ],
      );

      if (!inserted) return null;

      // Nada sai antes do marco, nem numa execucao adiantada pela tolerancia.
      const recipients = await manager.query<unknown[]>(
        `INSERT INTO plan_expiry_notice_deliveries
           (organization_id, notice_id, user_id, next_attempt_at)
         SELECT u.organization_id, $2, u.id, greatest(now(), $3::timestamptz)
           FROM users u
           JOIN access_profiles profile
             ON profile.id = u.profile_id
            AND profile.organization_id = u.organization_id
          WHERE u.organization_id = $1
            AND u.status = 'active'
            AND u.deleted_at IS NULL
            AND profile.code = 'admin'
         ON CONFLICT (notice_id, user_id) DO NOTHING
         RETURNING id`,
        [term.organizationId, inserted.id, notice.dueAt],
      );

      await insertAuditEvent(manager, {
        organizationId: term.organizationId,
        actorUserId: null,
        action: 'plan_expiry_notice.generated',
        entityType: 'organization_plan_term',
        entityId: term.termId,
        afterValues: {
          milestone: notice.milestone,
          endsAt: term.endsAt.toISOString(),
          recipients: recipients.length,
        },
        requestId: null,
      });

      return { noticeId: inserted.id, recipients: recipients.length };
    });
  }
}
