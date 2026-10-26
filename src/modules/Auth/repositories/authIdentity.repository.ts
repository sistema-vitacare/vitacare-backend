import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { AuthLookup, LoginIdentity } from '../types/auth.types';

/** Linha crua da busca: a organizacao sempre vem, a conta pode faltar. */
interface LookupRow extends Omit<LoginIdentity, 'permissions' | 'userId'> {
  userId: string | null;
}

/**
 * Leitura de identidade para autenticacao. E o unico ponto que consulta um
 * usuario sem organizacao no contexto: no login a organizacao ainda esta sendo
 * descoberta pelo codigo enviado, e o par organizacao/e-mail e sempre exigido.
 */
@Injectable()
export class AuthIdentityRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Parte da organizacao e chega na conta por juncao a esquerda, em uma unica
   * consulta. Assim o chamador sabe a organizacao mesmo quando o e-mail nao
   * existe — a tentativa falha precisa disso para ser auditada — sem que o
   * caminho da conta inexistente gaste uma consulta a mais que o da existente.
   */
  async findForAuthentication(
    organizationCode: string,
    email: string,
  ): Promise<AuthLookup> {
    const row = await this.dataSource
      .createQueryBuilder()
      .select('organization.id', 'organizationId')
      .addSelect('organization.status', 'organizationStatus')
      .addSelect('organization.deleted_at', 'organizationDeletedAt')
      .addSelect('user.id', 'userId')
      .addSelect('user.password_hash', 'passwordHash')
      .addSelect('user.must_change_password', 'mustChangePassword')
      .addSelect('user.status', 'status')
      .addSelect('user.deleted_at', 'deletedAt')
      .addSelect('profile.code', 'profile')
      .from('organizations', 'organization')
      .leftJoin(
        'users',
        'user',
        'user.organization_id = organization.id AND user.email = :email',
        { email },
      )
      .leftJoin(
        'access_profiles',
        'profile',
        'profile.id = user.profile_id AND profile.organization_id = user.organization_id',
      )
      .where('organization.code = :organizationCode', { organizationCode })
      .getRawOne<LookupRow>();

    if (!row) {
      return { organizationId: null, identity: null };
    }

    if (row.userId === null) {
      return { organizationId: row.organizationId, identity: null };
    }

    // Permissoes so sao necessarias na sessao ja estabelecida; o login decide
    // apenas se a credencial vale.
    return {
      organizationId: row.organizationId,
      identity: { ...row, userId: row.userId, permissions: new Set() },
    };
  }

  async findPasswordHash(
    userId: string,
    organizationId: string,
  ): Promise<string | null> {
    const rows = await this.dataSource.query<
      Array<{ passwordHash: string | null }>
    >(
      `SELECT password_hash AS "passwordHash"
         FROM users
        WHERE id = $1
          AND organization_id = $2
          AND status = 'active'
          AND deleted_at IS NULL`,
      [userId, organizationId],
    );

    return rows[0]?.passwordHash ?? null;
  }
}
