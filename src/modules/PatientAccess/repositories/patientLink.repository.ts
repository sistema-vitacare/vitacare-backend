import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import type {
  CareLinkRole,
  PatientLinkRole,
} from '@/modules/Patient/types/patient.types';
import { CARE_LINK_ROLES } from '@/modules/Patient/types/patient.types';

import { PatientAccessErrors } from '../patientAccess.errors';
import type {
  CreatePatientLinkCommand,
  CreatePatientLinkOutcome,
  EligibleUserRow,
  ListEligibleUsersFilter,
  ListPatientLinksFilter,
  PatientLinkActor,
  PatientLinkPatch,
  PatientLinkRow,
  RevokePatientLinkOutcome,
  TargetPatientLinkCommand,
  UpdatePatientLinkCommand,
  UpdatePatientLinkOutcome,
} from '../types/patientAccess.types';
import { findPatientInScope } from './patientAccess.query';

interface PostgresError {
  code: string;
  constraint?: string;
}

/** Perfis aceitos em cada papel (o admin herda o profissional). */
const PROFILES_BY_ROLE: Readonly<Record<PatientLinkRole, readonly string[]>> = {
  responsible_professional: ['professional', 'admin'],
  caregiver: ['caregiver'],
  family: ['family'],
};

const PATCH_COLUMNS: Readonly<Record<keyof PatientLinkPatch, string>> = {
  linkType: 'link_type',
  note: 'note',
};

const PATCH_FIELDS = Object.keys(PATCH_COLUMNS) as Array<
  keyof PatientLinkPatch
>;

const LINK_SELECT = `
  SELECT link.id,
         link.patient_id AS "patientId",
         p.name AS "patientName",
         p.status AS "patientStatus",
         link.user_id AS "userId",
         u.name AS "userName",
         ap.code AS "userProfile",
         u.status AS "userStatus",
         link.role,
         link.link_type AS "linkType",
         link.note,
         link.created_at AS "createdAt",
         link.updated_at AS "updatedAt",
         link.deleted_at AS "deletedAt"
    FROM user_patients link
    JOIN patients p
      ON p.id = link.patient_id
     AND p.organization_id = link.organization_id
    JOIN users u
      ON u.id = link.user_id
     AND u.organization_id = link.organization_id
    JOIN access_profiles ap
      ON ap.id = u.profile_id
     AND ap.organization_id = u.organization_id`;

/** `%`, `_` e `\` digitados na busca sao texto, nao curinga do ILIKE. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

const isPostgresError = (error: unknown): error is PostgresError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { code?: unknown }).code === 'string';

/**
 * Troca de perfil (BE-10): revoga, na transacao de quem chama, os vinculos de
 * cuidado vigentes cujo papel nao corresponde ao novo perfil. Voltar ao perfil
 * antigo nao os ressuscita. O vinculo de responsavel segue a regra do BE-09.
 */
export const revokeCareLinksOnProfileChange = async (
  manager: EntityManager,
  input: PatientLinkActor & { userId: string; newProfile: string },
): Promise<void> => {
  // UPDATE no TypeORM devolve [linhas do RETURNING, quantidade afetada].
  const [revoked] = await manager.query<
    [Array<{ id: string; patientId: string; role: CareLinkRole }>, number]
  >(
    `UPDATE user_patients
        SET deleted_at = now(),
            updated_at = now()
      WHERE organization_id = $1
        AND user_id = $2
        AND role = ANY($3::varchar[])
        AND role <> $4
        AND deleted_at IS NULL
      RETURNING id, patient_id AS "patientId", role`,
    [input.organizationId, input.userId, CARE_LINK_ROLES, input.newProfile],
  );

  for (const link of revoked) {
    await insertAuditEvent(manager, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'patient_link.revoked',
      entityType: 'patient_link',
      entityId: link.id,
      afterValues: {
        patientId: link.patientId,
        userId: input.userId,
        role: link.role,
        reason: 'profile_changed',
      },
      requestId: input.requestId,
    });
  }
};

/**
 * Vinculos usuario-paciente da organizacao da sessao. Criar toma a trava
 * `FOR NO KEY UPDATE` da organizacao (a mesma de usuarios e do responsavel),
 * para o perfil lido na validacao nao mudar antes do INSERT; editar e revogar
 * travam so a linha do vinculo. Revogar grava `deleted_at` e preserva a linha.
 */
@Injectable()
export class PatientLinkRepository {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    command: CreatePatientLinkCommand,
  ): Promise<CreatePatientLinkOutcome> {
    return this.write(async (manager) => {
      await manager.query(
        `SELECT 1 FROM organizations WHERE id = $1 FOR NO KEY UPDATE`,
        [command.organizationId],
      );

      const patient = await findPatientInScope(
        manager,
        {
          organizationId: command.organizationId,
          viewerUserId: null,
          viewerLinkRoles: [],
        },
        command.patientId,
      );

      if (!patient) return { kind: 'patient_not_found' };
      if (patient.status === 'inactive') return { kind: 'patient_inactive' };

      const role = await this.careRoleOf(
        manager,
        command.organizationId,
        command.userId,
      );

      if (!role) return { kind: 'invalid_user' };

      const [existing] = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM user_patients
          WHERE organization_id = $1
            AND patient_id = $2
            AND user_id = $3
            AND role = ANY($4::varchar[])
            AND deleted_at IS NULL`,
        [
          command.organizationId,
          command.patientId,
          command.userId,
          CARE_LINK_ROLES,
        ],
      );

      if (existing) return { kind: 'already_exists' };

      const [{ id }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO user_patients
           (organization_id, user_id, patient_id, role, link_type, note)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          command.organizationId,
          command.userId,
          command.patientId,
          role,
          command.linkType,
          command.note,
        ],
      );

      await this.audit(manager, command, id, 'patient_link.created', {
        patientId: command.patientId,
        userId: command.userId,
        role,
      });

      return {
        kind: 'created',
        link: (await this.findIn(manager, command.organizationId, id))!,
      };
    });
  }

  async list(
    organizationId: string,
    filter: ListPatientLinksFilter,
  ): Promise<[PatientLinkRow[], number]> {
    const where = `
     WHERE link.organization_id = $1
       AND ($2::uuid IS NULL OR link.patient_id = $2)
       AND ($3::uuid IS NULL OR link.user_id = $3)
       AND ($4::varchar IS NULL OR link.role = $4)
       AND (CASE WHEN $5::varchar = 'active'
                 THEN link.deleted_at IS NULL
                 ELSE link.deleted_at IS NOT NULL END)`;
    const parameters = [
      organizationId,
      filter.patientId ?? null,
      filter.userId ?? null,
      filter.role ?? null,
      filter.status,
    ];

    try {
      const [rows, [{ total }]] = await Promise.all([
        this.dataSource.query<PatientLinkRow[]>(
          `${LINK_SELECT} ${where}
            ORDER BY link.created_at DESC, link.id
            LIMIT $6 OFFSET $7`,
          [...parameters, filter.take, filter.skip],
        ),
        this.dataSource.query<Array<{ total: number }>>(
          `SELECT count(*)::int AS total FROM user_patients link ${where}`,
          parameters,
        ),
      ]);

      return [rows, total];
    } catch (error) {
      throw translatePgError(error, 'user_patients');
    }
  }

  async findById(
    organizationId: string,
    linkId: string,
  ): Promise<PatientLinkRow | null> {
    try {
      return await this.findIn(this.dataSource.manager, organizationId, linkId);
    } catch (error) {
      throw translatePgError(error, 'user_patients');
    }
  }

  /** Grava so o que mudou; nada mudou nao grava nem audita. */
  async update(
    command: UpdatePatientLinkCommand,
  ): Promise<UpdatePatientLinkOutcome> {
    return this.write(async (manager) => {
      const current = await this.findIn(
        manager,
        command.organizationId,
        command.linkId,
        { forUpdate: true },
      );

      if (!current) return { kind: 'not_found' };
      if (current.role === 'responsible_professional') {
        return { kind: 'responsible' };
      }
      if (current.deletedAt) return { kind: 'revoked' };
      if (current.patientStatus === 'inactive') {
        return { kind: 'patient_inactive' };
      }

      const changed = PATCH_FIELDS.filter(
        (field) =>
          command.patch[field] !== undefined &&
          command.patch[field] !== current[field],
      );

      if (changed.length === 0) return { kind: 'unchanged', link: current };

      await manager.query(
        `UPDATE user_patients
            SET ${changed.map((field, index) => `${PATCH_COLUMNS[field]} = $${index + 3}`).join(', ')},
                updated_at = now()
          WHERE organization_id = $1
            AND id = $2`,
        [
          command.organizationId,
          command.linkId,
          ...changed.map((field) => command.patch[field]),
        ],
      );
      await this.audit(
        manager,
        command,
        command.linkId,
        'patient_link.updated',
        {
          fields: changed,
        },
      );

      return {
        kind: 'updated',
        link: (await this.findIn(
          manager,
          command.organizationId,
          command.linkId,
        ))!,
      };
    });
  }

  /** Corta o acesso na proxima requisicao; a linha fica como historico. */
  async revoke(
    command: TargetPatientLinkCommand,
  ): Promise<RevokePatientLinkOutcome> {
    return this.write(async (manager) => {
      const current = await this.findIn(
        manager,
        command.organizationId,
        command.linkId,
        { forUpdate: true },
      );

      if (!current) return { kind: 'not_found' };
      if (current.role === 'responsible_professional') {
        return { kind: 'responsible' };
      }
      if (current.deletedAt) return { kind: 'already_revoked' };

      await manager.query(
        `UPDATE user_patients
            SET deleted_at = now(),
                updated_at = now()
          WHERE organization_id = $1
            AND id = $2`,
        [command.organizationId, command.linkId],
      );
      await this.audit(
        manager,
        command,
        command.linkId,
        'patient_link.revoked',
        {
          patientId: current.patientId,
          userId: current.userId,
          role: current.role,
          reason: 'manual',
        },
      );

      return {
        kind: 'revoked',
        link: (await this.findIn(
          manager,
          command.organizationId,
          command.linkId,
        ))!,
      };
    });
  }

  /** Usuarios nao inativos com perfil aceito no papel, sem dados de contato. */
  async listEligibleUsers(
    organizationId: string,
    filter: ListEligibleUsersFilter,
  ): Promise<[EligibleUserRow[], number]> {
    const where = `
      FROM users u
      JOIN access_profiles ap
        ON ap.id = u.profile_id
       AND ap.organization_id = u.organization_id
     WHERE u.organization_id = $1
       AND u.status IN ('pending', 'active')
       AND ap.code = ANY($2::varchar[])
       AND ap.deleted_at IS NULL
       AND ($3::text IS NULL OR u.name ILIKE $3 ESCAPE '\\')`;
    const parameters = [
      organizationId,
      PROFILES_BY_ROLE[filter.role],
      filter.search ? `%${escapeLike(filter.search)}%` : null,
    ];

    try {
      const [rows, [{ total }]] = await Promise.all([
        this.dataSource.query<EligibleUserRow[]>(
          `SELECT u.id, u.name, ap.code AS profile, u.status ${where}
            ORDER BY u.name, u.id
            LIMIT $4 OFFSET $5`,
          [...parameters, filter.take, filter.skip],
        ),
        this.dataSource.query<Array<{ total: number }>>(
          `SELECT count(*)::int AS total ${where}`,
          parameters,
        ),
      ]);

      return [rows, total];
    } catch (error) {
      throw translatePgError(error, 'users');
    }
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
    organizationId: string,
    linkId: string,
    options: { forUpdate?: boolean } = {},
  ): Promise<PatientLinkRow | null> {
    const [row] = await manager.query<PatientLinkRow[]>(
      `${LINK_SELECT}
        WHERE link.organization_id = $1
          AND link.id = $2
        ${options.forUpdate ? 'FOR NO KEY UPDATE OF link' : ''}`,
      [organizationId, linkId],
    );

    return row ?? null;
  }

  /** Papel de cuidado do usuario nao inativo do tenant, pelo perfil dele. */
  private async careRoleOf(
    manager: EntityManager,
    organizationId: string,
    userId: string,
  ): Promise<CareLinkRole | null> {
    const [row] = await manager.query<Array<{ code: CareLinkRole }>>(
      `SELECT ap.code
         FROM users u
         JOIN access_profiles ap
           ON ap.id = u.profile_id
          AND ap.organization_id = u.organization_id
        WHERE u.organization_id = $1
          AND u.id = $2
          AND u.status IN ('pending', 'active')
          AND ap.code = ANY($3::varchar[])
          AND ap.deleted_at IS NULL`,
      [organizationId, userId, CARE_LINK_ROLES],
    );

    return row?.code ?? null;
  }

  /** Auditoria sem o conteudo de `linkType` e `note`. */
  private async audit(
    manager: EntityManager,
    actor: PatientLinkActor,
    linkId: string,
    action: string,
    afterValues: Record<string, unknown>,
  ): Promise<void> {
    await insertAuditEvent(manager, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action,
      entityType: 'patient_link',
      entityId: linkId,
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
      error.constraint === 'user_patients_care_link_unique'
    ) {
      return new DomainException({
        ...PatientAccessErrors.ALREADY_EXISTS,
        detail: `Violação de unicidade na constraint ${error.constraint}.`,
        cause: error,
      });
    }

    return translatePgError(error, 'user_patients');
  }
}
