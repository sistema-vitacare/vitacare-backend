import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import type { FormStatus } from '@/modules/Form/types/form.types';
import { findPatientInScope } from '@/modules/PatientAccess/repositories/patientAccess.query';
import { PATIENT_SCOPE_WHERE } from '@/modules/Patient/repositories/patientScope.query';
import type { PatientScope } from '@/modules/Patient/types/patient.types';

import { checkAnswers } from '../policies/followUpAnswers.policy';
import type {
  AnnulFollowUpCommand,
  AnnulFollowUpOutcome,
  CreateFollowUpCommand,
  CreateFollowUpOutcome,
  FollowUpActor,
  FollowUpAnswerRow,
  FollowUpDetail,
  FollowUpStatus,
  ListFollowUpsFilter,
  VersionField,
} from '../types/followUp.types';

/** Registros de pacientes do alcance `$1`..`$3` (alias `r`). */
const RECORD_FROM = `
    FROM follow_up_records r
    JOIN patients p
      ON p.id = r.patient_id
     AND p.organization_id = r.organization_id
    JOIN follow_up_responses resp
      ON resp.record_id = r.id
     AND resp.organization_id = r.organization_id
    JOIN follow_up_forms f
      ON f.id = resp.form_id
     AND f.organization_id = resp.organization_id
    JOIN follow_up_form_versions v
      ON v.id = resp.form_version_id
     AND v.organization_id = resp.organization_id
    JOIN users author
      ON author.id = r.author_user_id
     AND author.organization_id = r.organization_id
    LEFT JOIN users annuller
      ON annuller.id = r.annulled_by_user_id
     AND annuller.organization_id = r.organization_id
  ${PATIENT_SCOPE_WHERE}`;

const RECORD_SELECT = `
  SELECT r.id,
         r.patient_id AS "patientId",
         resp.form_id AS "formId",
         f.name AS "formName",
         resp.form_version_id AS "formVersionId",
         v.version_number AS "formVersionNumber",
         author.id AS "authorId",
         author.name AS "authorName",
         r.visited_at AS "visitedAt",
         r.created_at AS "submittedAt",
         r.notes,
         r.status,
         r.deleted_at AS "annulledAt",
         annuller.id AS "annulledById",
         annuller.name AS "annulledByName",
         r.annulment_reason AS "annulmentReason"
  ${RECORD_FROM}`;

interface RecordRow {
  id: string;
  patientId: string;
  formId: string;
  formName: string;
  formVersionId: string;
  formVersionNumber: number;
  authorId: string;
  authorName: string;
  visitedAt: Date;
  submittedAt: Date;
  notes: string | null;
  status: FollowUpStatus;
  annulledAt: Date | null;
  annulledById: string | null;
  annulledByName: string | null;
  annulmentReason: string | null;
}

const ORGANIZATION_WIDE = (organizationId: string): PatientScope => ({
  organizationId,
  viewerUserId: null,
  viewerLinkRoles: [],
});

/**
 * Registro, resposta e itens de acompanhamento (UC11) da organizacao da
 * sessao. Paciente fora do alcance de quem le se comporta como inexistente.
 *
 * O envio trava paciente e formulario com `FOR SHARE`: conflita com a
 * inativacao do paciente e com publicar/desativar o formulario (ambas
 * `FOR NO KEY UPDATE`), entao o registro sempre usa a versao que era vigente e
 * um paciente que era ativo no commit. Tudo numa transacao: falha em qualquer
 * passo nao deixa registro sem resposta nem resposta sem itens.
 */
@Injectable()
export class FollowUpRepository {
  constructor(private readonly dataSource: DataSource) {}

  async create(command: CreateFollowUpCommand): Promise<CreateFollowUpOutcome> {
    return this.write(async (manager) => {
      await manager.query(
        `SELECT 1 FROM patients
          WHERE organization_id = $1 AND id = $2
          FOR SHARE`,
        [command.organizationId, command.patientId],
      );

      const patient = await findPatientInScope(
        manager,
        command,
        command.patientId,
      );

      if (!patient) return { kind: 'patient_not_found' };
      if (patient.status !== 'active') return { kind: 'patient_inactive' };

      const [form] = await manager.query<
        Array<{ status: FormStatus; applicable: boolean }>
      >(
        `SELECT f.status,
                (f.audience = 'organization' OR EXISTS (
                   SELECT 1 FROM follow_up_form_patients fp
                    WHERE fp.form_id = f.id
                      AND fp.organization_id = f.organization_id
                      AND fp.patient_id = $3
                      AND fp.deleted_at IS NULL)) AS applicable
           FROM follow_up_forms f
          WHERE f.organization_id = $1
            AND f.id = $2
          FOR SHARE OF f`,
        [command.organizationId, command.formId, command.patientId],
      );

      if (!form || form.status === 'draft') return { kind: 'form_not_found' };
      if (form.status === 'inactive') return { kind: 'form_inactive' };
      if (!form.applicable) return { kind: 'form_not_applicable' };

      const [current] = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM follow_up_form_versions
          WHERE organization_id = $1
            AND form_id = $2
            AND status = 'published'
          ORDER BY version_number DESC
          LIMIT 1`,
        [command.organizationId, command.formId],
      );

      if (current?.id !== command.formVersionId) {
        return { kind: 'version_outdated' };
      }

      const fields = await manager.query<VersionField[]>(
        `SELECT id, name,
                field_type AS "fieldType",
                CASE WHEN NOT active THEN 'disabled'
                     WHEN required THEN 'required'
                     ELSE 'optional' END AS requirement,
                decimal_places AS "decimalPlaces",
                scale_min AS "scaleMin",
                scale_max AS "scaleMax",
                options
           FROM follow_up_form_fields
          WHERE organization_id = $1
            AND version_id = $2
          ORDER BY position`,
        [command.organizationId, command.formVersionId],
      );
      const check = checkAnswers(fields, command.answers);

      if (check.kind === 'empty') return { kind: 'empty' };
      if (check.kind === 'invalid') {
        return { kind: 'invalid_answers', errors: check.errors };
      }

      const [{ id }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO follow_up_records
           (organization_id, patient_id, author_user_id, visited_at, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          command.organizationId,
          command.patientId,
          command.actorUserId,
          command.visitedAt,
          command.notes,
        ],
      );
      const [{ id: responseId }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO follow_up_responses
           (organization_id, record_id, form_id, form_version_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [command.organizationId, id, command.formId, command.formVersionId],
      );

      await manager.query(
        `INSERT INTO follow_up_response_items
           (organization_id, response_id, form_version_id, field_id, value)
         SELECT $1, $2, $3, x.field_id, x.value
           FROM jsonb_to_recordset($4::jsonb) AS x(field_id uuid, value text)`,
        [
          command.organizationId,
          responseId,
          command.formVersionId,
          JSON.stringify(
            check.items.map((item) => ({
              field_id: item.fieldId,
              value: item.value,
            })),
          ),
        ],
      );
      await this.audit(manager, command, id, 'follow_up.created', {
        formId: command.formId,
        formVersionId: command.formVersionId,
        itemCount: check.items.length,
      });

      return {
        kind: 'created',
        followUp: (await this.findIn(manager, command, id))!,
      };
    });
  }

  async annul(command: AnnulFollowUpCommand): Promise<AnnulFollowUpOutcome> {
    return this.write(async (manager) => {
      const [record] = await manager.query<
        Array<{
          patientId: string;
          authorUserId: string;
          status: FollowUpStatus;
        }>
      >(
        `SELECT patient_id AS "patientId",
                author_user_id AS "authorUserId",
                status
           FROM follow_up_records
          WHERE organization_id = $1
            AND id = $2
          FOR UPDATE`,
        [command.organizationId, command.followUpId],
      );

      if (!record) return { kind: 'not_found' };

      if (!command.annulAny) {
        if (!(await findPatientInScope(manager, command, record.patientId))) {
          return { kind: 'not_found' };
        }
        if (record.authorUserId !== command.actorUserId) {
          return { kind: 'not_author' };
        }
      }

      if (record.status === 'annulled') return { kind: 'already_annulled' };

      await manager.query(
        `UPDATE follow_up_records
            SET status = 'annulled',
                deleted_at = now(),
                annulled_by_user_id = $3,
                annulment_reason = $4,
                updated_at = now()
          WHERE organization_id = $1
            AND id = $2`,
        [
          command.organizationId,
          command.followUpId,
          command.actorUserId,
          command.reason,
        ],
      );
      await this.audit(
        manager,
        command,
        command.followUpId,
        'follow_up.annulled',
        {
          ownRecord: record.authorUserId === command.actorUserId,
          reasonLength: command.reason.length,
        },
      );

      return {
        kind: 'annulled',
        followUp: (await this.findIn(
          manager,
          ORGANIZATION_WIDE(command.organizationId),
          command.followUpId,
        ))!,
      };
    });
  }

  /** `null` quando o paciente do filtro esta fora do alcance. */
  async list(
    scope: PatientScope,
    filter: ListFollowUpsFilter,
  ): Promise<[FollowUpDetail[], number] | null> {
    try {
      const manager = this.dataSource.manager;

      if (!(await findPatientInScope(manager, scope, filter.patientId))) {
        return null;
      }

      const where = `
          AND r.patient_id = $4
          AND ($5::varchar IS NULL OR r.status = $5)
          AND ($6::date IS NULL
               OR r.visited_at >= $6::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
          AND ($7::date IS NULL
               OR r.visited_at < ($7::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
          AND ($8::uuid IS NULL OR resp.form_id = $8)
          AND ($9::uuid IS NULL OR r.author_user_id = $9)
          AND (($10::uuid IS NULL AND $11::varchar IS NULL) OR EXISTS (
                SELECT 1
                  FROM follow_up_response_items i
                  JOIN follow_up_form_fields ff
                    ON ff.id = i.field_id
                   AND ff.organization_id = i.organization_id
                 WHERE i.response_id = resp.id
                   AND i.organization_id = resp.organization_id
                   AND ($10::uuid IS NULL OR ff.field_key = $10)
                   AND ($11::varchar IS NULL OR lower(ff.section) = lower($11))))
          AND ($12::boolean OR r.status = 'valid')`;
      const parameters = [
        scope.organizationId,
        scope.viewerUserId,
        scope.viewerLinkRoles,
        filter.patientId,
        filter.status ?? null,
        filter.from ?? null,
        filter.to ?? null,
        filter.formId ?? null,
        filter.authorUserId ?? null,
        filter.fieldKey ?? null,
        filter.section ?? null,
        filter.includeAnnulled,
      ];

      const [rows, [{ total }]] = await Promise.all([
        manager.query<RecordRow[]>(
          `${RECORD_SELECT} ${where}
            ORDER BY r.visited_at DESC, r.created_at DESC, r.id
            LIMIT $13 OFFSET $14`,
          [...parameters, filter.take, filter.skip],
        ),
        manager.query<Array<{ total: number }>>(
          `SELECT count(*)::int AS total ${RECORD_FROM} ${where}`,
          parameters,
        ),
      ]);

      return [await this.withAnswers(manager, scope, rows), total];
    } catch (error) {
      throw translatePgError(error, 'follow_ups');
    }
  }

  async findById(
    scope: PatientScope,
    followUpId: string,
    includeAnnulled: boolean,
  ): Promise<FollowUpDetail | null> {
    try {
      return await this.findIn(
        this.dataSource.manager,
        scope,
        followUpId,
        includeAnnulled,
      );
    } catch (error) {
      throw translatePgError(error, 'follow_ups');
    }
  }

  private async write<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (error) {
      throw error instanceof DomainException
        ? error
        : translatePgError(error, 'follow_ups');
    }
  }

  private async findIn(
    manager: EntityManager,
    scope: PatientScope,
    followUpId: string,
    includeAnnulled = true,
  ): Promise<FollowUpDetail | null> {
    const rows = await manager.query<RecordRow[]>(
      `${RECORD_SELECT}
          AND r.id = $4
          AND ($5::boolean OR r.status = 'valid')`,
      [
        scope.organizationId,
        scope.viewerUserId,
        scope.viewerLinkRoles,
        followUpId,
        includeAnnulled,
      ],
    );
    const [detail] = await this.withAnswers(manager, scope, rows);

    return detail ?? null;
  }

  /** Itens de todos os registros numa consulta, com os campos da versao. */
  private async withAnswers(
    manager: EntityManager,
    scope: PatientScope,
    rows: RecordRow[],
  ): Promise<FollowUpDetail[]> {
    if (rows.length === 0) return [];

    const answers = await manager.query<
      Array<FollowUpAnswerRow & { recordId: string }>
    >(
      `SELECT resp.record_id AS "recordId",
              ff.id AS "fieldId",
              ff.field_key AS "fieldKey",
              ff.name,
              ff.field_type AS "fieldType",
              ff.unit,
              ff.section,
              ff.position,
              i.value
         FROM follow_up_response_items i
         JOIN follow_up_responses resp
           ON resp.id = i.response_id
          AND resp.organization_id = i.organization_id
         JOIN follow_up_form_fields ff
           ON ff.id = i.field_id
          AND ff.organization_id = i.organization_id
        WHERE i.organization_id = $1
          AND resp.record_id = ANY($2::uuid[])
        ORDER BY ff.position`,
      [scope.organizationId, rows.map((row) => row.id)],
    );

    return rows.map((row) => ({
      id: row.id,
      patientId: row.patientId,
      formId: row.formId,
      formName: row.formName,
      formVersionId: row.formVersionId,
      formVersionNumber: row.formVersionNumber,
      author: { id: row.authorId, name: row.authorName },
      visitedAt: row.visitedAt,
      submittedAt: row.submittedAt,
      notes: row.notes,
      status: row.status,
      annulledAt: row.annulledAt,
      annulledBy:
        row.annulledById && row.annulledByName
          ? { id: row.annulledById, name: row.annulledByName }
          : null,
      annulmentReason: row.annulmentReason,
      answers: answers
        .filter((answer) => answer.recordId === row.id)
        .map(({ recordId: _recordId, ...answer }) => answer),
    }));
  }

  /** Auditoria sem valor clinico nem texto do motivo. */
  private async audit(
    manager: EntityManager,
    actor: FollowUpActor,
    followUpId: string,
    action: string,
    afterValues: Record<string, unknown>,
  ): Promise<void> {
    await insertAuditEvent(manager, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action,
      entityType: 'follow_up_record',
      entityId: followUpId,
      afterValues,
      requestId: actor.requestId,
    });
  }
}
