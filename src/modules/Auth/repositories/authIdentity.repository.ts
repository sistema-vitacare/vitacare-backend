import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { LoginIdentity } from '../types/auth.types';

/**
 * Leitura de identidade para autenticacao. E o unico ponto que consulta um
 * usuario sem organizacao no contexto: no login a organizacao ainda esta sendo
 * descoberta pelo codigo enviado, e o par organizacao/e-mail e sempre exigido.
 */
@Injectable()
export class AuthIdentityRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findForLogin(
    organizationCode: string,
    email: string,
  ): Promise<LoginIdentity | null> {
    const row = await this.dataSource
      .createQueryBuilder()
      .select('user.id', 'userId')
      .addSelect('user.organization_id', 'organizationId')
      .addSelect('user.password_hash', 'passwordHash')
      .addSelect('user.must_change_password', 'mustChangePassword')
      .addSelect('user.status', 'status')
      .addSelect('user.deleted_at', 'deletedAt')
      .addSelect('organization.status', 'organizationStatus')
      .addSelect('organization.deleted_at', 'organizationDeletedAt')
      .addSelect('profile.code', 'profile')
      .from('users', 'user')
      .innerJoin(
        'organizations',
        'organization',
        'organization.id = user.organization_id',
      )
      .innerJoin(
        'access_profiles',
        'profile',
        'profile.id = user.profile_id AND profile.organization_id = user.organization_id',
      )
      .where('organization.code = :organizationCode', { organizationCode })
      .andWhere('user.email = :email', { email })
      .getRawOne<Omit<LoginIdentity, 'permissions'>>();

    if (!row) {
      return null;
    }

    // Permissoes so sao necessarias na sessao ja estabelecida; o login decide
    // apenas se a credencial vale.
    return { ...row, permissions: new Set() };
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
