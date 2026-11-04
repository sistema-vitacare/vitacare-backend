import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import { checkPlanSeat } from '@/modules/Plan/repositories/planSeat.query';

import { PatientErrors } from '../patient.errors';
import { PATIENT_SCOPE_WHERE } from './patientScope.query';
import type {
  CreatePatientCommand,
  CreatePatientOutcome,
  DeactivatePatientOutcome,
  ListPatientsFilter,
  PatientActor,
  PatientFields,
  PatientPatch,
  PatientRow,
  PatientScope,
  ReactivatePatientOutcome,
  TargetPatientCommand,
  UpdatePatientCommand,
  UpdatePatientOutcome,
} from '../types/patient.types';

interface PostgresError {
  code: string;
  constraint?: string;
}

const COLUMNS: Readonly<Record<keyof PatientFields, string>> = {
  name: 'name',
  birthDate: 'birth_date',
  sex: 'sex',
  cpf: 'cpf',
  phone: 'phone',
  email: 'email',
  zipCode: 'zip_code',
  street: 'street',
  addressNumber: 'address_number',
  addressComplement: 'address_complement',
  district: 'district',
  city: 'city',
  state: 'state',
  mainCondition: 'main_condition',
  secondaryConditions: 'secondary_conditions',
  healthPlan: 'health_plan',
  notes: 'notes',
};

const FIELDS = Object.keys(COLUMNS) as Array<keyof PatientFields>;

const RESPONSIBLE_ROLE = 'responsible_professional';

/** Perfis aceitos como profissional responsavel (admin herda o profissional). */
const RESPONSIBLE_PROFILES = [ProfileCode.PROFESSIONAL, ProfileCode.ADMIN];

/** Pacientes do tenant `$1`; com `$2`, so os vinculados a ele num papel de `$3`. */
const PATIENT_SELECT = `
  SELECT p.id,
         p.name,
         to_char(p.birth_date, 'YYYY-MM-DD') AS "birthDate",
         p.sex,
         p.cpf,
         p.phone,
         p.email::text AS email,
         p.zip_code AS "zipCode",
         p.street,
         p.address_number AS "addressNumber",
         p.address_complement AS "addressComplement",
         p.district,
         p.city,
         p.state,
         p.main_condition AS "mainCondition",
         p.secondary_conditions AS "secondaryConditions",
         p.health_plan AS "healthPlan",
         p.notes,
         p.status,
         r.id AS "responsibleId",
         r.name AS "responsibleName",
         r.status AS "responsibleStatus",
         p.created_at AS "createdAt",
         p.updated_at AS "updatedAt",
         p.deleted_at AS "deletedAt"
    FROM patients p
    LEFT JOIN user_patients link
      ON link.patient_id = p.id
     AND link.organization_id = p.organization_id
     AND link.role = '${RESPONSIBLE_ROLE}'
     AND link.deleted_at IS NULL
    LEFT JOIN users r
      ON r.id = link.user_id
     AND r.organization_id = link.organization_id`;

/** `%`, `_` e `\` digitados na busca sao texto, nao curinga do ILIKE. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

/** Busca so com digitos e pontuacao de CPF tambem procura no CPF. */
const cpfDigitsOf = (search: string): string | null => {
  if (!/^[0-9.\-\s]+$/.test(search)) return null;

  const digits = search.replace(/\D/g, '');

  return digits.length > 0 ? digits : null;
};

const sameValue = (left: unknown, right: unknown): boolean =>
  Array.isArray(left) || Array.isArray(right)
    ? JSON.stringify(left) === JSON.stringify(right)
    : left === right;

const isPostgresError = (error: unknown): error is PostgresError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { code?: unknown }).code === 'string';

/**
 * Leituras e escritas sobre pacientes da organizacao da sessao. Paciente de
 * outro tenant, ou sem vinculo para quem so le vinculados, se comporta como
 * inexistente.
 *
 * Cadastro e reativacao ocupam vaga: tomam a trava `FOR NO KEY UPDATE` da
 * organizacao (mesma de usuarios) antes de `checkPlanSeat`, o que serializa as
 * escritas concorrentes do tenant. A troca de responsavel toma a mesma trava,
 * para nao correr com a troca de perfil do usuario (BE-05), que tambem a usa.
 * Edicao sem troca e inativacao travam so o paciente.
 */
@Injectable()
export class PatientRepository {
  constructor(private readonly dataSource: DataSource) {}

  async list(
    scope: PatientScope,
    filter: ListPatientsFilter,
  ): Promise<[PatientRow[], number]> {
    const where = `${PATIENT_SCOPE_WHERE}
       AND p.status = $4
       AND ($5::text IS NULL
            OR p.name ILIKE $5 ESCAPE '\\'
            OR ($6::text IS NOT NULL AND p.cpf LIKE $6))
       AND ($7::text IS NULL
            OR p.main_condition ILIKE $7 ESCAPE '\\'
            OR EXISTS (
                 SELECT 1 FROM unnest(p.secondary_conditions) AS condition
                  WHERE condition ILIKE $7 ESCAPE '\\'))`;
    const cpfDigits = filter.search ? cpfDigitsOf(filter.search) : null;
    const parameters = [
      scope.organizationId,
      scope.viewerUserId,
      scope.viewerLinkRoles,
      filter.status,
      filter.search ? `%${escapeLike(filter.search)}%` : null,
      cpfDigits ? `%${cpfDigits}%` : null,
      filter.condition ? `%${escapeLike(filter.condition)}%` : null,
    ];

    try {
      const [rows, [{ total }]] = await Promise.all([
        this.dataSource.query<PatientRow[]>(
          `${PATIENT_SELECT} ${where}
            ORDER BY p.name, p.id
            LIMIT $8 OFFSET $9`,
          [...parameters, filter.take, filter.skip],
        ),
        this.dataSource.query<Array<{ total: number }>>(
          `SELECT count(*)::int AS total FROM patients p ${where}`,
          parameters,
        ),
      ]);

      return [rows, total];
    } catch (error) {
      throw translatePgError(error, 'patients');
    }
  }

  async findById(
    scope: PatientScope,
    patientId: string,
  ): Promise<PatientRow | null> {
    try {
      return await this.findIn(this.dataSource.manager, scope, patientId);
    } catch (error) {
      throw translatePgError(error, 'patients');
    }
  }

  async create(command: CreatePatientCommand): Promise<CreatePatientOutcome> {
    return this.write(async (manager) => {
      await this.lockOrganization(manager, command.organizationId);

      if (!(await this.isValidResponsible(manager, command))) {
        return { kind: 'invalid_responsible' };
      }

      const seat = await checkPlanSeat(
        manager,
        command.organizationId,
        'patients',
      );

      if (seat) return { kind: seat };

      const [{ id }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO patients
           (organization_id, ${FIELDS.map((field) => COLUMNS[field]).join(', ')})
         VALUES ($1, ${FIELDS.map((_, index) => `$${index + 2}`).join(', ')})
         RETURNING id`,
        [
          command.organizationId,
          ...FIELDS.map((field) => command.fields[field]),
        ],
      );

      await this.linkResponsible(
        manager,
        command,
        id,
        command.responsibleUserId,
      );
      await this.audit(manager, command, id, 'patient.created', {
        responsibleUserId: command.responsibleUserId,
      });

      return {
        kind: 'created',
        patient: (await this.findIn(manager, command, id))!,
      };
    });
  }

  /** Grava so o que mudou; nada mudou nao grava nem audita. */
  async update(command: UpdatePatientCommand): Promise<UpdatePatientOutcome> {
    return this.write(async (manager) => {
      if (command.responsibleUserId !== undefined) {
        await this.lockOrganization(manager, command.organizationId);
      }

      const current = await this.findIn(manager, command, command.patientId, {
        forUpdate: true,
      });

      if (!current) return { kind: 'not_found' };
      if (current.status === 'inactive') return { kind: 'inactive' };

      const changed = (Object.keys(command.patch) as Array<keyof PatientPatch>)
        .filter((field) => command.patch[field] !== undefined)
        .filter((field) =>
          field === 'email' && command.patch.email && current.email
            ? command.patch.email.toLowerCase() !== current.email.toLowerCase()
            : !sameValue(command.patch[field], current[field]),
        );
      const responsibleChanged =
        command.responsibleUserId !== undefined &&
        command.responsibleUserId !== current.responsibleId;

      if (changed.length === 0 && !responsibleChanged) {
        return { kind: 'unchanged', patient: current };
      }

      if (
        responsibleChanged &&
        !(await this.isValidResponsible(manager, {
          organizationId: command.organizationId,
          responsibleUserId: command.responsibleUserId!,
        }))
      ) {
        return { kind: 'invalid_responsible' };
      }

      if (changed.length > 0) {
        await manager.query(
          `UPDATE patients
              SET ${changed.map((field, index) => `${COLUMNS[field]} = $${index + 3}`).join(', ')},
                  updated_at = now()
            WHERE organization_id = $1
              AND id = $2`,
          [
            command.organizationId,
            command.patientId,
            ...changed.map((field) => command.patch[field]),
          ],
        );

        await this.audit(
          manager,
          command,
          command.patientId,
          'patient.updated',
          {
            fields: changed,
          },
        );
      }

      if (responsibleChanged) {
        await manager.query(
          `UPDATE user_patients
              SET deleted_at = now(),
                  updated_at = now()
            WHERE organization_id = $1
              AND patient_id = $2
              AND role = '${RESPONSIBLE_ROLE}'
              AND deleted_at IS NULL`,
          [command.organizationId, command.patientId],
        );
        await this.linkResponsible(
          manager,
          command,
          command.patientId,
          command.responsibleUserId!,
        );
        await this.audit(
          manager,
          command,
          command.patientId,
          'patient.responsible_changed',
          {
            fromUserId: current.responsibleId,
            toUserId: command.responsibleUserId,
          },
        );
      }

      return {
        kind: 'updated',
        patient: (await this.findIn(manager, command, command.patientId))!,
      };
    });
  }

  /** Libera a vaga e sai da listagem principal; vinculos e registros ficam. */
  async deactivate(
    command: TargetPatientCommand,
  ): Promise<DeactivatePatientOutcome> {
    return this.write(async (manager) => {
      const current = await this.findIn(manager, command, command.patientId, {
        forUpdate: true,
      });

      if (!current) return { kind: 'not_found' };
      if (current.status === 'inactive') return { kind: 'already_inactive' };

      await this.setStatus(manager, command, 'inactive');
      await this.audit(
        manager,
        command,
        command.patientId,
        'patient.deactivated',
        null,
      );

      return {
        kind: 'deactivated',
        patient: (await this.findIn(manager, command, command.patientId))!,
      };
    });
  }

  /** Reativar ocupa vaga de novo: mesma checagem do cadastro. */
  async reactivate(
    command: TargetPatientCommand,
  ): Promise<ReactivatePatientOutcome> {
    return this.write(async (manager) => {
      await this.lockOrganization(manager, command.organizationId);

      const current = await this.findIn(manager, command, command.patientId, {
        forUpdate: true,
      });

      if (!current) return { kind: 'not_found' };
      if (current.status === 'active') return { kind: 'already_active' };

      const seat = await checkPlanSeat(
        manager,
        command.organizationId,
        'patients',
      );

      if (seat) return { kind: seat };

      await this.setStatus(manager, command, 'active');
      await this.audit(
        manager,
        command,
        command.patientId,
        'patient.reactivated',
        null,
      );

      return {
        kind: 'reactivated',
        patient: (await this.findIn(manager, command, command.patientId))!,
      };
    });
  }

  private async write<T>(work: (manager: EntityManager) => Promise<T>) {
    try {
      return await this.dataSource.transaction(work);
    } catch (error) {
      throw this.translate(error);
    }
  }

  private async findIn(
    manager: EntityManager,
    scope: PatientScope,
    patientId: string,
    options: { forUpdate?: boolean } = {},
  ): Promise<PatientRow | null> {
    const [row] = await manager.query<PatientRow[]>(
      `${PATIENT_SELECT} ${PATIENT_SCOPE_WHERE}
          AND p.id = $4
        ${options.forUpdate ? 'FOR NO KEY UPDATE OF p' : ''}`,
      [
        scope.organizationId,
        scope.viewerUserId,
        scope.viewerLinkRoles,
        patientId,
      ],
    );

    return row ?? null;
  }

  private async lockOrganization(
    manager: EntityManager,
    organizationId: string,
  ): Promise<void> {
    await manager.query(
      `SELECT 1 FROM organizations WHERE id = $1 FOR NO KEY UPDATE`,
      [organizationId],
    );
  }

  /** Usuario nao inativo do tenant, com perfil profissional ou admin. */
  private async isValidResponsible(
    manager: EntityManager,
    input: { organizationId: string; responsibleUserId: string },
  ): Promise<boolean> {
    const [row] = await manager.query<Array<{ id: string }>>(
      `SELECT u.id
         FROM users u
         JOIN access_profiles ap
           ON ap.id = u.profile_id
          AND ap.organization_id = u.organization_id
        WHERE u.organization_id = $1
          AND u.id = $2
          AND u.status IN ('pending', 'active')
          AND ap.code = ANY($3::varchar[])
          AND ap.deleted_at IS NULL`,
      [input.organizationId, input.responsibleUserId, RESPONSIBLE_PROFILES],
    );

    return Boolean(row);
  }

  private async linkResponsible(
    manager: EntityManager,
    actor: PatientActor,
    patientId: string,
    userId: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, '${RESPONSIBLE_ROLE}')`,
      [actor.organizationId, userId, patientId],
    );
  }

  private async setStatus(
    manager: EntityManager,
    command: TargetPatientCommand,
    status: 'active' | 'inactive',
  ): Promise<void> {
    await manager.query(
      `UPDATE patients
          SET status = $3::varchar,
              deleted_at = CASE WHEN $3::varchar = 'inactive' THEN now() END,
              updated_at = now()
        WHERE organization_id = $1
          AND id = $2`,
      [command.organizationId, command.patientId, status],
    );
  }

  /** Auditoria sem nome, CPF, contato, endereco nem condicoes. */
  private async audit(
    manager: EntityManager,
    actor: PatientActor,
    patientId: string,
    action: string,
    afterValues: Record<string, unknown> | null,
  ): Promise<void> {
    await insertAuditEvent(manager, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action,
      entityType: 'patient',
      entityId: patientId,
      afterValues,
      requestId: actor.requestId,
    });
  }

  private translate(error: unknown): unknown {
    if (error instanceof DomainException || !isPostgresError(error)) {
      return error;
    }

    if (
      error.code === '23505' &&
      error.constraint === 'patients_org_cpf_unique'
    ) {
      return new DomainException({
        ...PatientErrors.DUPLICATE_CPF,
        detail: `Violação de unicidade na constraint ${error.constraint}.`,
        fields: [{ field: 'cpf', code: 'DUPLICATE' }],
        cause: error,
      });
    }

    return translatePgError(error, 'patients');
  }
}
