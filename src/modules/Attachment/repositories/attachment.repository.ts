import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import type {
  FollowUpActor,
  FollowUpStatus,
} from '@/modules/FollowUp/types/followUp.types';
import { findPatientInScope } from '@/modules/PatientAccess/repositories/patientAccess.query';
import { PATIENT_SCOPE_WHERE } from '@/modules/Patient/repositories/patientScope.query';
import type { PatientScope } from '@/modules/Patient/types/patient.types';

import {
  ATTACHMENT_MAX_PER_RECORD,
  type AttachmentContentType,
  type AttachmentRow,
  type RemoveAttachmentCommand,
  type RemoveAttachmentOutcome,
  type UploadAttachmentCommand,
  type UploadAttachmentOutcome,
} from '../types/attachment.types';

/** Anexos ativos de registros de pacientes do alcance `$1`..`$3` (alias `a`). */
const ATTACHMENT_SELECT = `
  SELECT a.id,
         a.record_id AS "followUpId",
         a.file_name AS "fileName",
         a.content_type AS "contentType",
         a.size_bytes AS "sizeBytes",
         a.storage_key AS "storageKey",
         uploader.id AS "uploaderId",
         uploader.name AS "uploaderName",
         a.created_at AS "uploadedAt"
    FROM follow_up_attachments a
    JOIN follow_up_records r
      ON r.id = a.record_id
     AND r.organization_id = a.organization_id
    JOIN patients p
      ON p.id = r.patient_id
     AND p.organization_id = r.organization_id
    JOIN users uploader
      ON uploader.id = a.uploaded_by_user_id
     AND uploader.organization_id = a.organization_id
  ${PATIENT_SCOPE_WHERE}
     AND a.deleted_at IS NULL
     AND a.record_id = $4`;

interface AttachmentQueryRow {
  id: string;
  followUpId: string;
  fileName: string;
  contentType: AttachmentContentType;
  sizeBytes: number;
  storageKey: string;
  uploaderId: string;
  uploaderName: string;
  uploadedAt: Date;
}

const toRow = ({
  uploaderId,
  uploaderName,
  storageKey: _storageKey,
  ...row
}: AttachmentQueryRow): AttachmentRow => ({
  ...row,
  uploadedBy: { id: uploaderId, name: uploaderName },
});

const scopeParameters = (scope: PatientScope) => [
  scope.organizationId,
  scope.viewerUserId,
  scope.viewerLinkRoles,
];

/**
 * Anexos de registros de acompanhamento (BE-13) da organizacao da sessao.
 * Registro de paciente fora do alcance de quem le se comporta como
 * inexistente. O envio trava o registro com `FOR UPDATE` (serializa a contagem
 * e conflita com a anulacao) e o paciente com `FOR SHARE` (conflita com a
 * inativacao); o arquivo so e gravado depois de todas as checagens, dentro da
 * transacao, e a compensacao fica com quem chama.
 */
@Injectable()
export class AttachmentRepository {
  constructor(private readonly dataSource: DataSource) {}

  async upload(
    command: UploadAttachmentCommand,
    store: () => Promise<void>,
  ): Promise<UploadAttachmentOutcome> {
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

      if (!record) return { kind: 'follow_up_not_found' };

      await manager.query(
        `SELECT 1 FROM patients
          WHERE organization_id = $1 AND id = $2
          FOR SHARE`,
        [command.organizationId, record.patientId],
      );

      const patient = await findPatientInScope(
        manager,
        command,
        record.patientId,
      );

      if (!patient) return { kind: 'follow_up_not_found' };
      if (record.authorUserId !== command.actorUserId) {
        return { kind: 'not_author' };
      }
      if (record.status === 'annulled') return { kind: 'follow_up_annulled' };
      if (patient.status !== 'active') return { kind: 'patient_inactive' };

      const [{ active }] = await manager.query<Array<{ active: number }>>(
        `SELECT count(*)::int AS active
           FROM follow_up_attachments
          WHERE organization_id = $1
            AND record_id = $2
            AND deleted_at IS NULL`,
        [command.organizationId, command.followUpId],
      );

      if (active >= ATTACHMENT_MAX_PER_RECORD) return { kind: 'limit_reached' };

      await store();
      await manager.query(
        `INSERT INTO follow_up_attachments
           (id, organization_id, record_id, uploaded_by_user_id, file_name,
            content_type, storage_key, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          command.attachmentId,
          command.organizationId,
          command.followUpId,
          command.actorUserId,
          command.fileName,
          command.contentType,
          command.storageKey,
          command.sizeBytes,
        ],
      );
      await this.audit(
        manager,
        command,
        command.attachmentId,
        'follow_up_attachment.created',
        {
          followUpId: command.followUpId,
          fileName: command.fileName,
          contentType: command.contentType,
          sizeBytes: command.sizeBytes,
        },
      );

      const [created] = await manager.query<AttachmentQueryRow[]>(
        `${ATTACHMENT_SELECT} AND a.id = $5`,
        [...scopeParameters(command), command.followUpId, command.attachmentId],
      );

      return { kind: 'created', attachment: toRow(created) };
    });
  }

  /**
   * `null` quando o registro nao existe, o paciente esta fora do alcance ou,
   * sem `includeAnnulled`, o registro foi anulado.
   */
  async list(
    scope: PatientScope,
    followUpId: string,
    includeAnnulled: boolean,
  ): Promise<AttachmentRow[] | null> {
    try {
      const manager = this.dataSource.manager;
      const [record] = await manager.query<Array<{ patientId: string }>>(
        `SELECT patient_id AS "patientId"
           FROM follow_up_records
          WHERE organization_id = $1
            AND id = $2
            AND ($3::boolean OR status = 'valid')`,
        [scope.organizationId, followUpId, includeAnnulled],
      );

      if (
        !record ||
        !(await findPatientInScope(manager, scope, record.patientId))
      ) {
        return null;
      }

      const rows = await manager.query<AttachmentQueryRow[]>(
        `${ATTACHMENT_SELECT} ORDER BY a.created_at, a.id`,
        [...scopeParameters(scope), followUpId],
      );

      return rows.map(toRow);
    } catch (error) {
      throw translatePgError(error, 'follow_up_attachments');
    }
  }

  async findForDownload(
    scope: PatientScope,
    followUpId: string,
    attachmentId: string,
    includeAnnulled: boolean,
  ): Promise<(AttachmentRow & { storageKey: string }) | null> {
    try {
      const [row] = await this.dataSource.manager.query<AttachmentQueryRow[]>(
        `${ATTACHMENT_SELECT}
            AND a.id = $5
            AND ($6::boolean OR r.status = 'valid')`,
        [...scopeParameters(scope), followUpId, attachmentId, includeAnnulled],
      );

      return row ? { ...toRow(row), storageKey: row.storageKey } : null;
    } catch (error) {
      throw translatePgError(error, 'follow_up_attachments');
    }
  }

  async remove(
    command: RemoveAttachmentCommand,
  ): Promise<RemoveAttachmentOutcome> {
    return this.write(async (manager) => {
      const [attachment] = await manager.query<
        Array<{
          patientId: string;
          uploadedByUserId: string;
          fileName: string;
          contentType: AttachmentContentType;
          sizeBytes: number;
          storageKey: string;
        }>
      >(
        `SELECT r.patient_id AS "patientId",
                a.uploaded_by_user_id AS "uploadedByUserId",
                a.file_name AS "fileName",
                a.content_type AS "contentType",
                a.size_bytes AS "sizeBytes",
                a.storage_key AS "storageKey"
           FROM follow_up_attachments a
           JOIN follow_up_records r
             ON r.id = a.record_id
            AND r.organization_id = a.organization_id
          WHERE a.organization_id = $1
            AND a.record_id = $2
            AND a.id = $3
            AND a.deleted_at IS NULL
          FOR UPDATE OF a`,
        [command.organizationId, command.followUpId, command.attachmentId],
      );

      if (!attachment) return { kind: 'not_found' };

      if (!command.removeAny) {
        if (
          !(await findPatientInScope(manager, command, attachment.patientId))
        ) {
          return { kind: 'not_found' };
        }
        if (attachment.uploadedByUserId !== command.actorUserId) {
          return { kind: 'not_author' };
        }
      }

      await manager.query(
        `UPDATE follow_up_attachments
            SET deleted_at = now(),
                updated_at = now()
          WHERE organization_id = $1
            AND id = $2`,
        [command.organizationId, command.attachmentId],
      );
      await this.audit(
        manager,
        command,
        command.attachmentId,
        'follow_up_attachment.removed',
        {
          followUpId: command.followUpId,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
          ownAttachment: attachment.uploadedByUserId === command.actorUserId,
        },
      );

      return { kind: 'removed', storageKey: attachment.storageKey };
    });
  }

  private async write<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (error) {
      throw error instanceof DomainException
        ? error
        : translatePgError(error, 'follow_up_attachments');
    }
  }

  /** Nome do arquivo entra por decisao de Mateus (2026-11-05); conteudo nunca. */
  private async audit(
    manager: EntityManager,
    actor: FollowUpActor,
    attachmentId: string,
    action: string,
    afterValues: Record<string, unknown>,
  ): Promise<void> {
    await insertAuditEvent(manager, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action,
      entityType: 'follow_up_attachment',
      entityId: attachmentId,
      afterValues,
      requestId: actor.requestId,
    });
  }
}
