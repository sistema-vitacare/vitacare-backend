import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

import type { TenantOwned } from '@/common/database/tenantScoped.repository';

/** Token de recuperacao de uso unico; so o SHA-256 chega ao banco. */
@Entity('password_reset_tokens')
@Unique('password_reset_tokens_token_hash_unique', ['tokenHash'])
export class PasswordResetToken implements TenantOwned {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  userId!: string;

  @Column({ type: 'char', length: 64, select: false })
  tokenHash!: string;

  @Column('timestamptz')
  expiresAt!: Date;

  @Column('timestamptz', { nullable: true })
  consumedAt!: Date | null;

  @Column('timestamptz', { nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column('timestamptz', { nullable: true })
  deletedAt!: Date | null;
}
