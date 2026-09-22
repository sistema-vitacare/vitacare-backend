import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { LoginIdentity } from '../types/auth.types';

@Injectable()
export class AuthIdentityRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findForLogin(
    code: string,
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
      .where('organization.code = :code', { code })
      .andWhere('user.email = :email', { email })
      .getRawOne<Omit<LoginIdentity, 'permissions'>>();
    return row
      ? { ...row, profile: row.profile, permissions: new Set() }
      : null;
  }
}
