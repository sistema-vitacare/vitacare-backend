import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import type { FormStatus } from '@/modules/Form/types/form.types';
import type { PatientStatus } from '@/modules/Patient/types/patient.types';

import {
  type AlertRuleActor,
  type AlertRuleFields,
  type AlertRuleRow,
  type AlertRuleStatus,
  type CreateAlertRuleCommand,
  type CreateAlertRuleOutcome,
  type DeactivateAlertRuleOutcome,
  type ListAlertRulesFilter,
  type ReactivateAlertRuleOutcome,
  RULE_FIELD_TYPES,
  type TargetAlertRuleCommand,
  type UpdateAlertRuleCommand,
  type UpdateAlertRuleOutcome,
} from '../types/alert.types';

/** Regras da organizacao `$1` (alias `ar`). */
const RULE_FROM = `
    FROM alert_rules ar
   WHERE ar.organization_id = $1`;

/**
 * O campo vem da versao publicada mais recente que contem o `field_key`: a
 * regra so nasce sobre um campo da versao vigente, entao a linha sempre existe.
 */
const RULE_SELECT = `
  SELECT ar.id,
         f.id AS "formId",
         f.name AS "formName",
         ar.field_key AS "fieldKey",
         fld.name AS "fieldName",
         fld.field_type AS "fieldType",
         fld.unit AS "fieldUnit",
         pt.id AS "patientId",
         pt.name AS "patientName",
         ar.name,
         ar.description,
         ar.operator,
         ar.reference_value AS "referenceValue",
         ar.severity,
         ar.status,
         creator.id AS "createdById",
         creator.name AS "createdByName",
         ar.created_at AS "createdAt",
         ar.updated_at AS "updatedAt",
         ar.deleted_at AS "deletedAt"
    FROM alert_rules ar
    JOIN follow_up_forms f
      ON f.id = ar.form_id
     AND f.organization_id = ar.organization_id
    JOIN users creator
      ON creator.id = ar.created_by_user_id
     AND creator.organization_id = ar.organization_id
    LEFT JOIN patients pt
      ON pt.id = ar.patient_id
     AND pt.organization_id = ar.organization_id
   CROSS JOIN LATERAL (
     SELECT ff.name, ff.field_type, ff.unit
       FROM follow_up_form_fields ff
       JOIN follow_up_form_versions v
         ON v.id = ff.version_id
        AND v.organization_id = ff.organization_id
      WHERE ff.organization_id = ar.organization_id
        AND ff.form_id = ar.form_id
        AND ff.field_key = ar.field_key
        AND v.status = 'published'
      ORDER BY v.version_number DESC
      LIMIT 1
   ) fld
   WHERE ar.organization_id = $1`;

interface RawRuleRow {
  id: string;
  formId: string;
  formName: string;
  fieldKey: string;
  fieldName: string;
  fieldType: string;
  fieldUnit: string | null;
  patientId: string | null;
  patientName: string | null;
  name: string;
  description: string | null;
  operator: AlertRuleRow['operator'];
  referenceValue: string;
  severity: AlertRuleRow['severity'];
  status: AlertRuleStatus;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const COLUMN_OF: Record<keyof AlertRuleFields, string> = {
  name: 'name',
  description: 'description',
  operator: 'operator',
  referenceValue: 'reference_value',
  severity: 'severity',
};

const toRow = (raw: RawRuleRow): AlertRuleRow => ({
  id: raw.id,
  form: { id: raw.formId, name: raw.formName },
  field: {
    key: raw.fieldKey,
    name: raw.fieldName,
    fieldType: raw.fieldType,
    unit: raw.fieldUnit,
  },
  patient:
    raw.patientId && raw.patientName
      ? { id: raw.patientId, name: raw.patientName }
      : null,
  name: raw.name,
  description: raw.description,
  operator: raw.operator,
  referenceValue: Number(raw.referenceValue),
  severity: raw.severity,
  status: raw.status,
  createdBy: { id: raw.createdById, name: raw.createdByName },
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
  deletedAt: raw.deletedAt,
});

/**
 * Regras de alerta (UC09 passo 5, RF013) da organizacao da sessao. So admin e
 * profissional chegam aqui, e ambos alcancam a organizacao inteira.
 *
 * Criar trava formulario e paciente com `FOR SHARE`: conflita com desativar o
 * formulario, publicar outra versao e inativar o paciente, entao a regra
 * sempre nasce sobre um campo vigente de um formulario ativo aplicavel.
 */
@Injectable()
export class AlertRuleRepository {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    command: CreateAlertRuleCommand,
  ): Promise<CreateAlertRuleOutcome> {
    return this.write(async (manager) => {
      const [form] = await manager.query<
        Array<{ status: FormStatus; audience: string }>
      >(
        `SELECT status, audience FROM follow_up_forms
          WHERE organization_id = $1 AND id = $2
          FOR SHARE`,
        [command.organizationId, command.formId],
      );

      if (!form || form.status === 'draft') return { kind: 'form_not_found' };
      if (form.status === 'inactive') return { kind: 'form_inactive' };

      const [field] = await manager.query<Array<{ fieldType: string }>>(
        `SELECT ff.field_type AS "fieldType"
           FROM follow_up_form_fields ff
          WHERE ff.organization_id = $1
            AND ff.field_key = $3
            AND ff.version_id = (
              SELECT v.id FROM follow_up_form_versions v
               WHERE v.organization_id = $1
                 AND v.form_id = $2
                 AND v.status = 'published'
               ORDER BY v.version_number DESC
               LIMIT 1)`,
        [command.organizationId, command.formId, command.fieldKey],
      );

      if (!field) return { kind: 'field_not_found' };
      if (!(RULE_FIELD_TYPES as readonly string[]).includes(field.fieldType)) {
        return { kind: 'field_not_numeric' };
      }

      if (command.patientId) {
        const [patient] = await manager.query<
          Array<{ status: PatientStatus; applicable: boolean }>
        >(
          `SELECT p.status,
                  ($3 = 'organization' OR EXISTS (
                     SELECT 1 FROM follow_up_form_patients fp
                      WHERE fp.organization_id = p.organization_id
                        AND fp.form_id = $4
                        AND fp.patient_id = p.id
                        AND fp.deleted_at IS NULL)) AS applicable
             FROM patients p
            WHERE p.organization_id = $1 AND p.id = $2
            FOR SHARE OF p`,
          [
            command.organizationId,
            command.patientId,
            form.audience,
            command.formId,
          ],
        );

        if (!patient) return { kind: 'patient_not_found' };
        if (patient.status !== 'active') return { kind: 'patient_inactive' };
        if (!patient.applicable) return { kind: 'form_not_applicable' };
      }

      const [{ id }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO alert_rules
           (organization_id, form_id, field_key, patient_id, created_by_user_id,
            name, description, operator, reference_value, severity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          command.organizationId,
          command.formId,
          command.fieldKey,
          command.patientId,
          command.actorUserId,
          command.name,
          command.description,
          command.operator,
          command.referenceValue,
          command.severity,
        ],
      );

      await this.audit(manager, command, id, 'alert_rule.created', {
        formId: command.formId,
        fieldKey: command.fieldKey,
        patientId: command.patientId,
        severity: command.severity,
      });

      return {
        kind: 'created',
        rule: (await this.findIn(manager, command, id))!,
      };
    });
  }

  async list(
    organizationId: string,
    filter: ListAlertRulesFilter,
  ): Promise<[AlertRuleRow[], number]> {
    try {
      const manager = this.dataSource.manager;
      const where = `
          AND ($2::uuid IS NULL OR ar.form_id = $2)
          AND ($3::uuid IS NULL OR ar.patient_id = $3)
          AND ($4::varchar IS NULL OR ar.status = $4)`;
      const parameters = [
        organizationId,
        filter.formId ?? null,
        filter.patientId ?? null,
        filter.status ?? null,
      ];

      const [rows, [{ total }]] = await Promise.all([
        manager.query<RawRuleRow[]>(
          `${RULE_SELECT} ${where}
            ORDER BY (ar.status = 'active') DESC, ar.created_at DESC, ar.id
            LIMIT $5 OFFSET $6`,
          [...parameters, filter.take, filter.skip],
        ),
        manager.query<Array<{ total: number }>>(
          `SELECT count(*)::int AS total ${RULE_FROM} ${where}`,
          parameters,
        ),
      ]);

      return [rows.map(toRow), total];
    } catch (error) {
      throw translatePgError(error, 'alert_rules');
    }
  }

  async findById(
    organizationId: string,
    ruleId: string,
  ): Promise<AlertRuleRow | null> {
    try {
      return await this.findIn(
        this.dataSource.manager,
        { organizationId },
        ruleId,
      );
    } catch (error) {
      throw translatePgError(error, 'alert_rules');
    }
  }

  async update(
    command: UpdateAlertRuleCommand,
  ): Promise<UpdateAlertRuleOutcome> {
    return this.write(async (manager) => {
      const current = await this.lockRule(manager, command);

      if (!current) return { kind: 'not_found' };
      if (current.status !== 'active') return { kind: 'inactive' };

      const changed = (
        Object.keys(command.fields) as Array<keyof AlertRuleFields>
      ).filter((key) => command.fields[key] !== current[key]);

      if (changed.length === 0) return { kind: 'unchanged' };

      await manager.query(
        `UPDATE alert_rules
            SET ${[
              ...changed.map(
                (key, index) => `${COLUMN_OF[key]} = $${index + 3}`,
              ),
              'updated_at = now()',
            ].join(', ')}
          WHERE organization_id = $1 AND id = $2`,
        [
          command.organizationId,
          command.ruleId,
          ...changed.map((key) => command.fields[key]),
        ],
      );
      await this.audit(manager, command, command.ruleId, 'alert_rule.updated', {
        changedFields: changed,
      });

      return {
        kind: 'updated',
        rule: (await this.findIn(manager, command, command.ruleId))!,
      };
    });
  }

  async deactivate(
    command: TargetAlertRuleCommand,
  ): Promise<DeactivateAlertRuleOutcome> {
    return this.write(async (manager) => {
      const current = await this.lockRule(manager, command);

      if (!current) return { kind: 'not_found' };
      if (current.status !== 'active') return { kind: 'already_inactive' };

      await manager.query(
        `UPDATE alert_rules
            SET status = 'inactive', deleted_at = now(), updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [command.organizationId, command.ruleId],
      );
      await this.audit(
        manager,
        command,
        command.ruleId,
        'alert_rule.deactivated',
        null,
      );

      return {
        kind: 'deactivated',
        rule: (await this.findIn(manager, command, command.ruleId))!,
      };
    });
  }

  async reactivate(
    command: TargetAlertRuleCommand,
  ): Promise<ReactivateAlertRuleOutcome> {
    return this.write(async (manager) => {
      const current = await this.lockRule(manager, command);

      if (!current) return { kind: 'not_found' };
      if (current.status === 'active') return { kind: 'already_active' };

      await manager.query(
        `UPDATE alert_rules
            SET status = 'active', deleted_at = NULL, updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [command.organizationId, command.ruleId],
      );
      await this.audit(
        manager,
        command,
        command.ruleId,
        'alert_rule.reactivated',
        null,
      );

      return {
        kind: 'reactivated',
        rule: (await this.findIn(manager, command, command.ruleId))!,
      };
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
        : translatePgError(error, 'alert_rules');
    }
  }

  private async lockRule(
    manager: EntityManager,
    command: TargetAlertRuleCommand,
  ): Promise<(AlertRuleFields & { status: AlertRuleStatus }) | null> {
    const [row] = await manager.query<
      Array<
        Omit<AlertRuleFields, 'referenceValue'> & {
          referenceValue: string;
          status: AlertRuleStatus;
        }
      >
    >(
      `SELECT name, description, operator,
              reference_value AS "referenceValue", severity, status
         FROM alert_rules
        WHERE organization_id = $1 AND id = $2
        FOR NO KEY UPDATE`,
      [command.organizationId, command.ruleId],
    );

    return row ? { ...row, referenceValue: Number(row.referenceValue) } : null;
  }

  private async findIn(
    manager: EntityManager,
    scope: { organizationId: string },
    ruleId: string,
  ): Promise<AlertRuleRow | null> {
    const [row] = await manager.query<RawRuleRow[]>(
      `${RULE_SELECT} AND ar.id = $2`,
      [scope.organizationId, ruleId],
    );

    return row ? toRow(row) : null;
  }

  /** Auditoria sem o valor de referencia. */
  private async audit(
    manager: EntityManager,
    actor: AlertRuleActor,
    ruleId: string,
    action: string,
    afterValues: Record<string, unknown> | null,
  ): Promise<void> {
    await insertAuditEvent(manager, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action,
      entityType: 'alert_rule',
      entityId: ruleId,
      afterValues,
      requestId: actor.requestId,
    });
  }
}
