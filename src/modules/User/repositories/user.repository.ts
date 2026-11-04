import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import { translatePgError } from '@/common/errors/pgError.translator';
import { ProfileCode } from '@/common/context/requestContext.type';
import type { TenantProfileCode } from '@/modules/Access/access.permissions';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import { revokeCareLinksOnProfileChange } from '@/modules/PatientAccess/repositories/patientLink.repository';
import { checkPlanSeat } from '@/modules/Plan/repositories/planSeat.query';
import { revokeUserSessions } from '@/modules/Auth/repositories/authTransaction.repository';

import type {
  ChangeProfileCommand,
  ChangeProfileOutcome,
} from '../ChangeUserProfile/changeUserProfile.type';
import type {
  CreateUserCommand,
  CreateUserOutcome,
  DeactivateUserOutcome,
  ListUsersFilter,
  ReactivateUserOutcome,
  ReissueInvitationCommand,
  ReissueInvitationOutcome,
  TargetUserCommand,
  UpdateUserCommand,
  UpdateUserOutcome,
  UserActor,
  UserPatch,
  UserRow,
  UserStatus,
} from '../types/user.types';
import { UserErrors } from '../user.errors';

interface TargetRow {
  id: string;
  name: string;
  profileCode: string;
  profileName: string;
}

interface ProfileRow {
  id: string;
  name: string;
}

interface PostgresError {
  code: string;
  constraint?: string;
}

const USER_SELECT = `
  SELECT u.id,
         u.name,
         u.email,
         u.cpf,
         u.phone,
         u.status,
         p.code AS "profileCode",
         p.name AS "profileName",
         u.temporary_password_expires_at AS "temporaryPasswordExpiresAt",
         u.last_access_at AS "lastAccessAt",
         u.created_at AS "createdAt",
         u.updated_at AS "updatedAt",
         u.deleted_at AS "deletedAt"
    FROM users u
    JOIN access_profiles p
      ON p.id = u.profile_id
     AND p.organization_id = u.organization_id`;

const PATCH_COLUMNS: Readonly<Record<keyof UserPatch, string>> = {
  name: 'name',
  email: 'email',
  cpf: 'cpf',
  phone: 'phone',
};

const CONFLICT_BY_CONSTRAINT: Readonly<
  Record<
    string,
    { error: (typeof UserErrors)['DUPLICATE_EMAIL' | 'DUPLICATE_CPF'] } & {
      field: string;
    }
  >
> = {
  users_org_email_unique: { error: UserErrors.DUPLICATE_EMAIL, field: 'email' },
  users_org_cpf_unique: { error: UserErrors.DUPLICATE_CPF, field: 'cpf' },
};

/** `%`, `_` e `\` digitados na busca sao texto, nao curinga do ILIKE. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

const isPostgresError = (error: unknown): error is PostgresError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { code?: unknown }).code === 'string';

/**
 * Leituras e escritas sobre usuarios da organizacao da sessao. Toda consulta e
 * escopada por `organization_id`; usuario de outro tenant se comporta como
 * inexistente.
 *
 * Toda escrita que cria, rebaixa, inativa ou reativa usuario toma a trava da
 * organizacao e rele o ator depois dela. Isso serializa as escritas do tenant
 * (limite do plano sem corrida) e garante que sempre resta um admin ativo.
 *
 * A trava e `FOR NO KEY UPDATE`, nao `FOR UPDATE`: ela conflita consigo mesma
 * mas nao com o `FOR KEY SHARE` que o PostgreSQL pede na organizacao a cada
 * INSERT com FK para ela (auditoria, sessoes). Com `FOR UPDATE`, login e
 * auditoria do tenant esperariam pela escrita, e uma transacao que atualiza o
 * usuario alvo e depois audita entraria em deadlock com esta (40P01).
 */
@Injectable()
export class UserRepository {
  constructor(private readonly dataSource: DataSource) {}

  async list(
    organizationId: string,
    filter: ListUsersFilter,
  ): Promise<[UserRow[], number]> {
    const where = `
      WHERE u.organization_id = $1
        AND ($2::varchar IS NULL OR u.status = $2)
        AND ($3::varchar IS NULL OR p.code = $3)
        AND ($4::text IS NULL
             OR u.name ILIKE $4 ESCAPE '\\'
             OR u.email::text ILIKE $4 ESCAPE '\\')`;
    const parameters = [
      organizationId,
      filter.status ?? null,
      filter.profileCode ?? null,
      filter.search ? `%${escapeLike(filter.search)}%` : null,
    ];

    try {
      const [rows, [{ total }]] = await Promise.all([
        this.dataSource.query<UserRow[]>(
          `${USER_SELECT} ${where}
            ORDER BY u.name, u.id
            LIMIT $5 OFFSET $6`,
          [...parameters, filter.take, filter.skip],
        ),
        this.dataSource.query<Array<{ total: number }>>(
          `SELECT count(*)::int AS total
             FROM users u
             JOIN access_profiles p
               ON p.id = u.profile_id
              AND p.organization_id = u.organization_id
           ${where}`,
          parameters,
        ),
      ]);

      return [rows, total];
    } catch (error) {
      throw translatePgError(error, 'users');
    }
  }

  async findById(
    organizationId: string,
    userId: string,
  ): Promise<UserRow | null> {
    try {
      return await this.findIn(this.dataSource.manager, organizationId, userId);
    } catch (error) {
      throw translatePgError(error, 'users');
    }
  }

  /** Cadastro `pending` com convite; limite conta pendentes e ativos. */
  async create(command: CreateUserCommand): Promise<CreateUserOutcome> {
    return this.write(async (manager) => {
      await this.lockOrganization(manager, command.organizationId);

      if (!(await this.isActiveAdmin(manager, command))) {
        return { kind: 'actor_forbidden' };
      }

      const seat = await checkPlanSeat(
        manager,
        command.organizationId,
        'users',
      );

      if (seat) return { kind: seat };

      const profile = await this.findProfile(
        manager,
        command.organizationId,
        command.profileCode,
      );

      const [{ id }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO users
           (organization_id, profile_id, name, email, cpf, phone, password_hash,
            status, must_change_password, temporary_password_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', true, $8)
         RETURNING id`,
        [
          command.organizationId,
          profile.id,
          command.name,
          command.email,
          command.cpf,
          command.phone,
          command.passwordHash,
          command.expiresAt,
        ],
      );

      await this.audit(manager, command, id, 'user.created', {
        profile: command.profileCode,
      });

      return {
        kind: 'created',
        user: (await this.findIn(manager, command.organizationId, id))!,
      };
    });
  }

  /** Grava so o que mudou; nada mudou nao grava nem audita. */
  async update(command: UpdateUserCommand): Promise<UpdateUserOutcome> {
    return this.write(async (manager) => {
      const current = await this.findIn(
        manager,
        command.organizationId,
        command.targetUserId,
        { forUpdate: true },
      );

      if (!current) {
        return { kind: 'not_found' };
      }

      const changed = (Object.keys(command.patch) as Array<keyof UserPatch>)
        .filter((field) => command.patch[field] !== undefined)
        .filter((field) =>
          field === 'email'
            ? command.patch.email!.toLowerCase() !== current.email.toLowerCase()
            : command.patch[field] !== current[field],
        );

      if (changed.length === 0) {
        return { kind: 'unchanged', user: current };
      }

      const assignments = changed.map(
        (field, index) => `${PATCH_COLUMNS[field]} = $${index + 3}`,
      );

      await manager.query(
        `UPDATE users
            SET ${assignments.join(', ')}, updated_at = now()
          WHERE organization_id = $1
            AND id = $2`,
        [
          command.organizationId,
          command.targetUserId,
          ...changed.map((field) => command.patch[field]),
        ],
      );

      await this.audit(manager, command, current.id, 'user.updated', {
        fields: changed,
      });

      return {
        kind: 'updated',
        user: (await this.findIn(
          manager,
          command.organizationId,
          command.targetUserId,
        ))!,
      };
    });
  }

  /**
   * Revoga o acesso na hora (sessoes, links de recuperacao e, se pendente, o
   * convite) e preserva o resto: autoria, auditoria e registros ficam.
   */
  async deactivate(command: TargetUserCommand): Promise<DeactivateUserOutcome> {
    return this.write(async (manager) => {
      const target = await this.lockAndReadTarget(manager, command);

      if (target === null) return { kind: 'not_found' };
      if (target === 'actor_forbidden') return { kind: 'actor_forbidden' };
      if (target === 'inactive') return { kind: 'already_inactive' };

      await manager.query(
        `UPDATE users
            SET status = 'inactive',
                deleted_at = now(),
                temporary_password_expires_at = CASE
                  WHEN status = 'pending' THEN now()
                  ELSE temporary_password_expires_at
                END,
                updated_at = now()
          WHERE organization_id = $1
            AND id = $2`,
        [command.organizationId, command.targetUserId],
      );

      await revokeUserSessions(
        manager,
        command.targetUserId,
        command.organizationId,
        'user_deactivated',
      );

      await manager.query(
        `DELETE FROM password_reset_tokens
          WHERE user_id = $1
            AND organization_id = $2`,
        [command.targetUserId, command.organizationId],
      );

      await this.audit(
        manager,
        command,
        command.targetUserId,
        'user.deactivated',
        {
          fromStatus: target,
        },
      );

      return {
        kind: 'deactivated',
        user: (await this.findIn(
          manager,
          command.organizationId,
          command.targetUserId,
        ))!,
      };
    });
  }

  /** Volta sempre `active`; sessoes antigas continuam revogadas. */
  async reactivate(command: TargetUserCommand): Promise<ReactivateUserOutcome> {
    return this.write(async (manager) => {
      const target = await this.lockAndReadTarget(manager, command);

      if (target === null) return { kind: 'not_found' };
      if (target === 'actor_forbidden') return { kind: 'actor_forbidden' };
      if (target !== 'inactive') return { kind: 'already_active' };

      const seat = await checkPlanSeat(
        manager,
        command.organizationId,
        'users',
      );

      if (seat) return { kind: seat };

      await manager.query(
        `UPDATE users
            SET status = 'active',
                deleted_at = NULL,
                updated_at = now()
          WHERE organization_id = $1
            AND id = $2`,
        [command.organizationId, command.targetUserId],
      );

      await this.audit(
        manager,
        command,
        command.targetUserId,
        'user.reactivated',
        null,
      );

      return {
        kind: 'reactivated',
        user: (await this.findIn(
          manager,
          command.organizationId,
          command.targetUserId,
        ))!,
      };
    });
  }

  /** Troca senha provisoria e prazo do pendente; a anterior para de valer. */
  async reissueInvitation(
    command: ReissueInvitationCommand,
  ): Promise<ReissueInvitationOutcome> {
    return this.write(async (manager) => {
      const target = await this.lockAndReadTarget(manager, command);

      if (target === null) return { kind: 'not_found' };
      if (target === 'actor_forbidden') return { kind: 'actor_forbidden' };
      if (target === 'active') return { kind: 'already_accepted' };
      if (target === 'inactive') return { kind: 'inactive' };

      await manager.query(
        `UPDATE users
            SET password_hash = $3,
                temporary_password_expires_at = $4,
                updated_at = now()
          WHERE organization_id = $1
            AND id = $2`,
        [
          command.organizationId,
          command.targetUserId,
          command.passwordHash,
          command.expiresAt,
        ],
      );

      await revokeUserSessions(
        manager,
        command.targetUserId,
        command.organizationId,
        'invitation_reissued',
      );

      await this.audit(
        manager,
        command,
        command.targetUserId,
        'user.invitation_reissued',
        null,
      );

      return { kind: 'reissued' };
    });
  }

  /**
   * Troca de perfil (BE-05, spec 5.5); revoga os vinculos de cuidado que nao
   * cabem no novo perfil (BE-10). O status do alvo nao importa; o perfil
   * atual do alvo e lido sem filtro de `deleted_at` para que um perfil excluido
   * ainda possa ser trocado.
   */
  async changeProfile(
    command: ChangeProfileCommand,
  ): Promise<ChangeProfileOutcome> {
    return this.write(async (manager) => {
      await this.lockOrganization(manager, command.organizationId);

      const [target] = await manager.query<TargetRow[]>(
        `SELECT u.id,
                u.name,
                p.code AS "profileCode",
                p.name AS "profileName"
           FROM users u
           JOIN access_profiles p
             ON p.id = u.profile_id
            AND p.organization_id = u.organization_id
          WHERE u.id = $2
            AND u.organization_id = $1`,
        [command.organizationId, command.targetUserId],
      );

      if (!target) {
        return { kind: 'not_found' };
      }

      if (target.profileCode === String(command.profileCode)) {
        return { kind: 'unchanged', user: target };
      }

      if (!(await this.isActiveAdmin(manager, command))) {
        return { kind: 'actor_forbidden' };
      }

      const profile = await this.findProfile(
        manager,
        command.organizationId,
        command.profileCode,
      );

      await manager.query(
        `UPDATE users
            SET profile_id = $3,
                updated_at = now()
          WHERE id = $2
            AND organization_id = $1`,
        [command.organizationId, command.targetUserId, profile.id],
      );

      await this.audit(
        manager,
        command,
        command.targetUserId,
        'user.profile_changed',
        { fromProfile: target.profileCode, toProfile: command.profileCode },
      );
      await revokeCareLinksOnProfileChange(manager, {
        organizationId: command.organizationId,
        actorUserId: command.actorUserId,
        requestId: command.requestId,
        userId: command.targetUserId,
        newProfile: command.profileCode,
      });

      return {
        kind: 'changed',
        user: {
          id: target.id,
          name: target.name,
          profileCode: command.profileCode,
          profileName: profile.name,
        },
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
    organizationId: string,
    userId: string,
    options: { forUpdate?: boolean } = {},
  ): Promise<UserRow | null> {
    const [row] = await manager.query<UserRow[]>(
      `${USER_SELECT}
        WHERE u.organization_id = $1
          AND u.id = $2
        ${options.forUpdate ? 'FOR UPDATE OF u' : ''}`,
      [organizationId, userId],
    );

    return row ?? null;
  }

  private async lockOrganization(
    manager: EntityManager,
    organizationId: string,
  ): Promise<void> {
    // tests/modules/Access/accessControl.e2e-spec.ts (ORG_LOCK_QUERY) e tests/modules/User/userSchema.e2e-spec.ts repetem este SQL exato: mudou aqui, mude la.
    await manager.query(
      `SELECT 1 FROM organizations WHERE id = $1 FOR NO KEY UPDATE`,
      [organizationId],
    );
  }

  private async isActiveAdmin(
    manager: EntityManager,
    actor: UserActor,
  ): Promise<boolean> {
    const [row] = await manager.query<Array<{ id: string }>>(
      `SELECT u.id
         FROM users u
         JOIN access_profiles p
           ON p.id = u.profile_id
          AND p.organization_id = u.organization_id
        WHERE u.id = $2
          AND u.organization_id = $1
          AND u.status = 'active'
          AND u.deleted_at IS NULL
          AND p.code = $3
          AND p.deleted_at IS NULL`,
      [actor.organizationId, actor.actorUserId, ProfileCode.ADMIN],
    );

    return Boolean(row);
  }

  /**
   * Trava, alvo e ator na ordem da troca de perfil: alvo de outro tenant
   * responde inexistente antes de qualquer outra coisa.
   */
  private async lockAndReadTarget(
    manager: EntityManager,
    command: TargetUserCommand,
  ): Promise<UserStatus | 'actor_forbidden' | null> {
    await this.lockOrganization(manager, command.organizationId);

    const [target] = await manager.query<Array<{ status: UserStatus }>>(
      `SELECT status
         FROM users
        WHERE organization_id = $1
          AND id = $2
        FOR UPDATE`,
      [command.organizationId, command.targetUserId],
    );

    if (!target) {
      return null;
    }

    return (await this.isActiveAdmin(manager, command))
      ? target.status
      : 'actor_forbidden';
  }

  private async findProfile(
    manager: EntityManager,
    organizationId: string,
    profileCode: TenantProfileCode,
  ): Promise<ProfileRow> {
    const [profile] = await manager.query<ProfileRow[]>(
      `SELECT id, name
         FROM access_profiles
        WHERE organization_id = $1
          AND code = $2
          AND deleted_at IS NULL`,
      [organizationId, profileCode],
    );

    if (!profile) {
      // Os quatro perfis sao provisionados com a organizacao: ausencia e
      // inconsistencia de dados, nao erro do cliente (vira 500).
      throw new Error(
        `Perfil ${profileCode} ausente na organizacao da sessao.`,
      );
    }

    return profile;
  }

  /** Auditoria sem nome, e-mail, CPF, telefone nem senha. */
  private async audit(
    manager: EntityManager,
    actor: UserActor,
    userId: string,
    action: string,
    afterValues: Record<string, unknown> | null,
  ): Promise<void> {
    await insertAuditEvent(manager, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action,
      entityType: 'user',
      entityId: userId,
      afterValues,
      requestId: actor.requestId,
    });
  }

  private translate(error: unknown): unknown {
    if (error instanceof DomainException || !isPostgresError(error)) {
      return error;
    }

    const conflict =
      error.code === '23505' && error.constraint
        ? CONFLICT_BY_CONSTRAINT[error.constraint]
        : undefined;

    if (conflict) {
      return new DomainException({
        ...conflict.error,
        detail: `Violação de unicidade na constraint ${error.constraint}.`,
        fields: [{ field: conflict.field, code: 'DUPLICATE' }],
        cause: error,
      });
    }

    return translatePgError(error, 'users');
  }
}
