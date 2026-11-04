import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import { findPatientInScope } from '@/modules/PatientAccess/repositories/patientAccess.query';
import { PATIENT_SCOPE_WHERE } from '@/modules/Patient/repositories/patientScope.query';

import { toFieldColumns } from '../parsers/form.parser';
import { checkFieldKeys } from '../policies/formFields.policy';
import type {
  CreateFormCommand,
  CreateFormOutcome,
  FormActor,
  FormDetail,
  FormFieldConfig,
  FormFieldRow,
  FormPatch,
  FormScope,
  FormSummaryRow,
  ListFormsFilter,
  UpdateFormCommand,
  UpdateFormOutcome,
} from '../types/form.types';

/** Pacientes vigentes da lista de `f` dentro do alcance (`$1`..`$3`). */
const PATIENTS_IN_SCOPE = `
  FROM follow_up_form_patients fp
  JOIN patients p
    ON p.id = fp.patient_id
   AND p.organization_id = fp.organization_id
  ${PATIENT_SCOPE_WHERE}
   AND fp.form_id = f.id
   AND fp.deleted_at IS NULL`;

/**
 * Formularios do tenant `$1`. Com `$2` (quem so le), so os ativos que valem
 * para a organizacao inteira ou para um paciente do seu alcance.
 */
const FORM_SCOPE_WHERE = `
   WHERE f.organization_id = $1
     AND ($2::uuid IS NULL OR (
           f.status = 'active'
           AND (f.audience = 'organization'
                OR EXISTS (SELECT 1 ${PATIENTS_IN_SCOPE}))))`;

const FORM_SELECT = `
  SELECT f.id,
         f.name,
         f.description,
         f.tracking_type AS "trackingType",
         f.status,
         f.audience,
         COALESCE((SELECT array_agg(fp.patient_id::text ORDER BY fp.created_at, fp.patient_id)
                     ${PATIENTS_IN_SCOPE}), '{}') AS "patientIds",
         f.frequency_interval AS "frequencyInterval",
         f.frequency_unit AS "frequencyUnit",
         cv.id AS "currentVersionId",
         cv.version_number AS "currentVersionNumber",
         cv.published_at AS "currentPublishedAt",
         COALESCE(cv.field_count, 0) AS "currentFieldCount",
         ($2::uuid IS NULL AND EXISTS (
            SELECT 1 FROM follow_up_form_versions d
             WHERE d.form_id = f.id
               AND d.organization_id = f.organization_id
               AND d.status = 'draft'
               AND d.deleted_at IS NULL)) AS "hasDraft",
         f.created_at AS "createdAt",
         f.updated_at AS "updatedAt",
         f.deleted_at AS "deletedAt"
    FROM follow_up_forms f
    LEFT JOIN LATERAL (
      SELECT v.id,
             v.version_number,
             v.published_at,
             (SELECT count(*)::int
                FROM follow_up_form_fields ff
               WHERE ff.version_id = v.id
                 AND ff.active) AS field_count
        FROM follow_up_form_versions v
       WHERE v.form_id = f.id
         AND v.organization_id = f.organization_id
         AND v.status = 'published'
       ORDER BY v.version_number DESC
       LIMIT 1) cv ON true`;

const FIELD_SELECT = `
  SELECT ff.id,
         ff.version_id AS "versionId",
         ff.field_key AS "fieldKey",
         ff.name,
         ff.field_type AS "fieldType",
         CASE WHEN NOT ff.active THEN 'disabled'
              WHEN ff.required THEN 'required'
              ELSE 'optional' END AS requirement,
         ff.position,
         ff.section,
         ff.unit,
         ff.decimal_places AS "decimalPlaces",
         ff.scale_min AS "scaleMin",
         ff.scale_max AS "scaleMax",
         ff.options
    FROM follow_up_form_fields ff`;

/** Colunas do formulario editaveis sem nova versao. */
const PROPERTY_COLUMNS: Readonly<
  Record<Exclude<keyof FormPatch, 'frequency'>, string>
> = {
  name: 'name',
  description: 'description',
  trackingType: 'tracking_type',
};

/** `%`, `_` e `\` digitados na busca sao texto, nao curinga do ILIKE. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

const sameFrequency = (
  current: FormSummaryRow,
  next: FormPatch['frequency'],
): boolean =>
  next
    ? current.frequencyInterval === next.interval &&
      current.frequencyUnit === next.unit
    : current.frequencyInterval === null;

/**
 * Leituras e escritas sobre formularios da organizacao da sessao. Formulario
 * de outro tenant, ou fora do alcance de quem so le, se comporta como
 * inexistente.
 *
 * Toda escrita trava a linha do formulario (`FOR NO KEY UPDATE`) antes de ler
 * versoes e campos, o que serializa rascunho, publicacao e ciclo de vida do
 * mesmo formulario. Campos publicados nunca sao alterados.
 */
@Injectable()
export class FormRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** `null` quando o `patientId` do filtro esta fora do alcance. */
  async list(
    scope: FormScope,
    filter: ListFormsFilter,
  ): Promise<[FormSummaryRow[], number] | null> {
    try {
      if (
        filter.patientId &&
        !(await findPatientInScope(
          this.dataSource.manager,
          scope,
          filter.patientId,
        ))
      ) {
        return null;
      }

      const where = `${FORM_SCOPE_WHERE}
         AND ($4::varchar IS NULL OR f.status = $4)
         AND ($5::text IS NULL OR f.name ILIKE $5 ESCAPE '\\')
         AND ($6::uuid IS NULL OR (
               f.status = 'active'
               AND (f.audience = 'organization'
                    OR EXISTS (
                         SELECT 1 FROM follow_up_form_patients target
                          WHERE target.form_id = f.id
                            AND target.organization_id = f.organization_id
                            AND target.patient_id = $6
                            AND target.deleted_at IS NULL))))`;
      const parameters = [
        scope.organizationId,
        scope.viewerUserId,
        scope.viewerLinkRoles,
        filter.status ?? null,
        filter.search ? `%${escapeLike(filter.search)}%` : null,
        filter.patientId ?? null,
      ];

      const [rows, [{ total }]] = await Promise.all([
        this.dataSource.query<FormSummaryRow[]>(
          `${FORM_SELECT} ${where}
            ORDER BY f.name, f.id
            LIMIT $7 OFFSET $8`,
          [...parameters, filter.take, filter.skip],
        ),
        this.dataSource.query<Array<{ total: number }>>(
          `SELECT count(*)::int AS total FROM follow_up_forms f ${where}`,
          parameters,
        ),
      ]);

      return [rows, total];
    } catch (error) {
      throw translatePgError(error, 'forms');
    }
  }

  async findById(scope: FormScope, formId: string): Promise<FormDetail | null> {
    try {
      return await this.findIn(this.dataSource.manager, scope, formId);
    } catch (error) {
      throw translatePgError(error, 'forms');
    }
  }

  async create(command: CreateFormCommand): Promise<CreateFormOutcome> {
    return this.write(async (manager) => {
      const errors = checkFieldKeys(command.fields, new Map());

      if (errors.length > 0) return { kind: 'invalid_fields', errors };

      if (
        !(await this.areActivePatients(
          manager,
          command.organizationId,
          command.patientIds,
        ))
      ) {
        return { kind: 'invalid_patients' };
      }

      const [{ id }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO follow_up_forms
           (organization_id, name, description, tracking_type, audience,
            frequency_interval, frequency_unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          command.organizationId,
          command.properties.name,
          command.properties.description,
          command.properties.trackingType,
          command.audience,
          command.properties.frequency?.interval ?? null,
          command.properties.frequency?.unit ?? null,
        ],
      );
      const [{ id: draftId }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO follow_up_form_versions (organization_id, form_id, status)
         VALUES ($1, $2, 'draft')
         RETURNING id`,
        [command.organizationId, id],
      );

      await this.insertFields(manager, command, id, draftId, command.fields);
      await this.addPatients(manager, command, id, command.patientIds);
      await this.audit(manager, command, id, 'form.created', {
        audience: command.audience,
        fieldCount: command.fields.length,
      });

      return {
        kind: 'created',
        form: (await this.findIn(manager, command, id))!,
      };
    });
  }

  /** Grava so o que mudou; nada mudou nao grava nem audita. */
  async update(command: UpdateFormCommand): Promise<UpdateFormOutcome> {
    return this.write(async (manager) => {
      const current = await this.lockForm(manager, command, command.formId);

      if (!current) return { kind: 'not_found' };
      if (current.status === 'inactive') return { kind: 'inactive' };

      const changed = (Object.keys(command.patch) as Array<keyof FormPatch>)
        .filter((property) => command.patch[property] !== undefined)
        .filter((property) =>
          property === 'frequency'
            ? !sameFrequency(current, command.patch.frequency)
            : command.patch[property] !== current[property],
        );
      const audienceChanged =
        command.audience !== undefined && command.audience !== current.audience;
      const nextPatients =
        command.audience === undefined
          ? current.patientIds
          : command.audience === 'patients'
            ? command.patientIds!
            : [];
      const added = nextPatients.filter(
        (patientId) => !current.patientIds.includes(patientId),
      );
      const removed = current.patientIds.filter(
        (patientId) => !nextPatients.includes(patientId),
      );

      if (
        changed.length === 0 &&
        !audienceChanged &&
        added.length === 0 &&
        removed.length === 0
      ) {
        return { kind: 'unchanged', form: current };
      }

      if (
        !(await this.areActivePatients(manager, command.organizationId, added))
      ) {
        return { kind: 'invalid_patients' };
      }

      const assignments: Array<[string, unknown]> = changed.flatMap(
        (property): Array<[string, unknown]> =>
          property === 'frequency'
            ? [
                [
                  'frequency_interval',
                  command.patch.frequency?.interval ?? null,
                ],
                ['frequency_unit', command.patch.frequency?.unit ?? null],
              ]
            : [[PROPERTY_COLUMNS[property], command.patch[property]]],
      );

      if (audienceChanged) assignments.push(['audience', command.audience]);

      await manager.query(
        `UPDATE follow_up_forms
            SET ${assignments.map(([column], index) => `${column} = $${index + 3}`).join(', ')}${assignments.length > 0 ? ',' : ''}
                updated_at = now()
          WHERE organization_id = $1
            AND id = $2`,
        [
          command.organizationId,
          command.formId,
          ...assignments.map(([, value]) => value),
        ],
      );

      if (removed.length > 0) {
        await manager.query(
          `UPDATE follow_up_form_patients
              SET deleted_at = now(),
                  updated_at = now()
            WHERE organization_id = $1
              AND form_id = $2
              AND patient_id = ANY($3::uuid[])
              AND deleted_at IS NULL`,
          [command.organizationId, command.formId, removed],
        );
      }

      await this.addPatients(manager, command, command.formId, added);
      await this.audit(manager, command, command.formId, 'form.updated', {
        fields: [...changed, ...(audienceChanged ? ['audience'] : [])],
        ...(added.length > 0 && { patientsAdded: added }),
        ...(removed.length > 0 && { patientsRemoved: removed }),
      });

      return {
        kind: 'updated',
        form: (await this.findIn(manager, command, command.formId))!,
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
        : translatePgError(error, 'forms');
    }
  }

  /** Trava o formulario e devolve o detalhe; `null` fora do alcance. */
  private async lockForm(
    manager: EntityManager,
    scope: FormScope,
    formId: string,
  ): Promise<FormDetail | null> {
    const [locked] = await manager.query<Array<{ id: string }>>(
      `SELECT id FROM follow_up_forms
        WHERE organization_id = $1
          AND id = $2
        FOR NO KEY UPDATE`,
      [scope.organizationId, formId],
    );

    return locked ? this.findIn(manager, scope, formId) : null;
  }

  private async findIn(
    manager: EntityManager,
    scope: FormScope,
    formId: string,
  ): Promise<FormDetail | null> {
    const [row] = await manager.query<FormSummaryRow[]>(
      `${FORM_SELECT} ${FORM_SCOPE_WHERE}
          AND f.id = $4`,
      [scope.organizationId, scope.viewerUserId, scope.viewerLinkRoles, formId],
    );

    if (!row) return null;

    const [draft] =
      scope.viewerUserId === null
        ? await manager.query<Array<{ id: string; updatedAt: Date }>>(
            `SELECT id, updated_at AS "updatedAt"
               FROM follow_up_form_versions
              WHERE organization_id = $1
                AND form_id = $2
                AND status = 'draft'
                AND deleted_at IS NULL`,
            [scope.organizationId, formId],
          )
        : [];
    const versionIds = [row.currentVersionId, draft?.id].filter(
      (id): id is string => Boolean(id),
    );
    const fields =
      versionIds.length > 0
        ? await manager.query<Array<FormFieldRow & { versionId: string }>>(
            `${FIELD_SELECT}
              WHERE ff.organization_id = $1
                AND ff.version_id = ANY($2::uuid[])
              ORDER BY ff.position`,
            [scope.organizationId, versionIds],
          )
        : [];
    const fieldsOf = (versionId: string): FormFieldRow[] =>
      fields
        .filter((field) => field.versionId === versionId)
        .map(({ versionId: _versionId, ...field }) => field);

    return {
      ...row,
      currentFields: row.currentVersionId ? fieldsOf(row.currentVersionId) : [],
      draft: draft
        ? {
            id: draft.id,
            updatedAt: draft.updatedAt,
            fields: fieldsOf(draft.id),
          }
        : null,
    };
  }

  /** Todos os campos numa so instrucao; a posicao e a ordem da lista. */
  private async insertFields(
    manager: EntityManager,
    actor: FormActor,
    formId: string,
    versionId: string,
    fields: FormFieldConfig[],
  ): Promise<void> {
    const records = fields.map((field, position) => ({
      field_key: field.fieldKey ?? null,
      name: field.name,
      field_type: field.fieldType,
      ...toFieldColumns(field),
      position,
      section: field.section,
      unit: field.unit,
      decimal_places: field.decimalPlaces,
      scale_min: field.scaleMin,
      scale_max: field.scaleMax,
      options: field.options,
    }));

    await manager.query(
      `INSERT INTO follow_up_form_fields
         (organization_id, form_id, version_id, field_key, name, field_type,
          required, active, position, section, unit, decimal_places,
          scale_min, scale_max, options)
       SELECT $1, $2, $3, COALESCE(x.field_key, gen_random_uuid()), x.name,
              x.field_type, x.required, x.active, x.position, x.section,
              x.unit, x.decimal_places, x.scale_min, x.scale_max, x.options
         FROM jsonb_to_recordset($4::jsonb) AS x(
                field_key uuid, name varchar, field_type varchar,
                required boolean, active boolean, position integer,
                section varchar, unit varchar, decimal_places smallint,
                scale_min integer, scale_max integer, options jsonb)`,
      [actor.organizationId, formId, versionId, JSON.stringify(records)],
    );
  }

  private async areActivePatients(
    manager: EntityManager,
    organizationId: string,
    patientIds: string[],
  ): Promise<boolean> {
    if (patientIds.length === 0) return true;

    const [{ total }] = await manager.query<Array<{ total: number }>>(
      `SELECT count(*)::int AS total
         FROM patients
        WHERE organization_id = $1
          AND id = ANY($2::uuid[])
          AND status = 'active'`,
      [organizationId, patientIds],
    );

    return total === patientIds.length;
  }

  private async addPatients(
    manager: EntityManager,
    actor: FormActor,
    formId: string,
    patientIds: string[],
  ): Promise<void> {
    if (patientIds.length === 0) return;

    await manager.query(
      `INSERT INTO follow_up_form_patients (organization_id, form_id, patient_id)
       SELECT $1, $2, unnest($3::uuid[])`,
      [actor.organizationId, formId, patientIds],
    );
  }

  /** Auditoria sem conteudo de campo nem dado de paciente alem do id. */
  private async audit(
    manager: EntityManager,
    actor: FormActor,
    formId: string,
    action: string,
    afterValues: Record<string, unknown> | null,
  ): Promise<void> {
    await insertAuditEvent(manager, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action,
      entityType: 'follow_up_form',
      entityId: formId,
      afterValues,
      requestId: actor.requestId,
    });
  }
}
