import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { translatePgError } from '@/common/errors/pgError.translator';
import { ProfileCode } from '@/common/context/requestContext.type';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';

import type {
  ChangeProfileCommand,
  ChangeProfileOutcome,
} from '../ChangeUserProfile/changeUserProfile.type';

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

/**
 * Escritas sobre usuarios da organizacao da sessao. Toda consulta e escopada
 * por `organization_id`; usuario de outro tenant se comporta como inexistente.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Troca de perfil em uma transacao (BE-05, spec 5.5). A trava na linha da
   * organizacao serializa trocas concorrentes do mesmo tenant: o ator e relido
   * depois dela, entao um admin rebaixado por outra troca em curso nao consegue
   * mais agir. O status do alvo nao importa; o perfil atual do alvo e lido sem
   * filtro de `deleted_at` para que um perfil excluido ainda possa ser trocado.
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
    await manager.query(
      `SELECT 1 FROM organizations WHERE id = $1 FOR UPDATE`,
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
