import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { translatePgError } from '@/common/errors/pgError.translator';
import { ProfileCode } from '@/common/context/requestContext.type';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';

import type {
  ChangeProfileCommand,
  ChangeProfileOutcome,
} from '../ChangeUserProfile/changeUserProfile.type';
import type { ListUsersFilter, UserRow } from '../types/user.types';

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

/** `%`, `_` e `\` digitados na busca sao texto, nao curinga do ILIKE. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

/**
 * Leituras e escritas sobre usuarios da organizacao da sessao. Toda consulta e
 * escopada por `organization_id`; usuario de outro tenant se comporta como
 * inexistente.
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

  private async findIn(
    manager: EntityManager,
    organizationId: string,
    userId: string,
  ): Promise<UserRow | null> {
    const [row] = await manager.query<UserRow[]>(
      `${USER_SELECT}
        WHERE u.organization_id = $1
          AND u.id = $2`,
      [organizationId, userId],
    );

    return row ?? null;
  }

  /**
   * Troca de perfil em uma transacao (BE-05, spec 5.5). A trava na linha da
   * organizacao serializa trocas concorrentes do mesmo tenant: o ator e relido
   * depois dela, entao um admin rebaixado por outra troca em curso nao consegue
   * mais agir. O status do alvo nao importa; o perfil atual do alvo e lido sem
   * filtro de `deleted_at` para que um perfil excluido ainda possa ser trocado.
   *
   * A trava e `FOR NO KEY UPDATE`, nao `FOR UPDATE`: ela conflita consigo mesma
   * (serializa as trocas) mas nao com o `FOR KEY SHARE` que o PostgreSQL pede
   * na organizacao a cada INSERT com FK para ela (auditoria, sessoes). Com
   * `FOR UPDATE`, login e auditoria do tenant esperariam pela troca, e uma
   * transacao que atualiza o usuario alvo e depois audita entraria em deadlock
   * com esta (40P01).
   */
  async changeProfile(
    command: ChangeProfileCommand,
  ): Promise<ChangeProfileOutcome> {
    try {
      return await this.dataSource.transaction((manager) =>
        this.changeProfileIn(manager, command),
      );
    } catch (error) {
      throw translatePgError(error, 'users');
    }
  }

  private async changeProfileIn(
    manager: EntityManager,
    command: ChangeProfileCommand,
  ): Promise<ChangeProfileOutcome> {
    // tests/modules/Access/accessControl.e2e-spec.ts (ORG_LOCK_QUERY) e tests/modules/User/userSchema.e2e-spec.ts repetem este SQL exato: mudou aqui, mude la.
    await manager.query(
      `SELECT 1 FROM organizations WHERE id = $1 FOR NO KEY UPDATE`,
      [command.organizationId],
    );

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

    // Invariante: sempre resta um admin ativo porque toda troca rele o ator sob
    // esta trava. Qualquer caminho futuro que rebaixe, inative ou exclua
    // usuario precisa tomar a mesma trava da organizacao, senao a garantia cai.
    const [actor] = await manager.query<Array<{ id: string }>>(
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
      [command.organizationId, command.actorUserId, ProfileCode.ADMIN],
    );

    if (!actor) {
      return { kind: 'actor_forbidden' };
    }

    const [profile] = await manager.query<ProfileRow[]>(
      `SELECT id, name
         FROM access_profiles
        WHERE organization_id = $1
          AND code = $2
          AND deleted_at IS NULL`,
      [command.organizationId, command.profileCode],
    );

    if (!profile) {
      // Os quatro perfis sao provisionados com a organizacao: ausencia e
      // inconsistencia de dados, nao erro do cliente (vira 500).
      throw new Error(
        `Perfil ${command.profileCode} ausente na organizacao da sessao.`,
      );
    }

    await manager.query(
      `UPDATE users
          SET profile_id = $3,
              updated_at = now()
        WHERE id = $2
          AND organization_id = $1`,
      [command.organizationId, command.targetUserId, profile.id],
    );

    await insertAuditEvent(manager, {
      organizationId: command.organizationId,
      actorUserId: command.actorUserId,
      action: 'user.profile_changed',
      entityType: 'user',
      entityId: command.targetUserId,
      afterValues: {
        fromProfile: target.profileCode,
        toProfile: command.profileCode,
      },
      requestId: command.requestId,
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
  }
}
