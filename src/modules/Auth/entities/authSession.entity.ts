import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';
import type { TenantOwned } from '@/common/database/tenantScoped.repository';

export type AuthSessionType = 'normal' | 'password_change';

@Entity('auth_sessions')
@Unique('auth_sessions_token_hash_unique', ['tokenHash'])
export class AuthSession implements TenantOwned {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' }) id!: string;
  @Column('uuid') organizationId!: string;
  @Column('uuid') userId!: string;
  @Column({ type: 'char', length: 64, select: false }) tokenHash!: string;
  @Column({ type: 'varchar', length: 24 }) type!: AuthSessionType;
  @Column('timestamptz') expiresAt!: Date;
  @Column('timestamptz') lastActivityAt!: Date;
  @Column('timestamptz', { nullable: true }) revokedAt!: Date | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) revokedReason!:
    string | null;
  @Column('timestamptz', { nullable: true }) deletedAt!: Date | null;
}
