import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

import type { TenantOwned } from '@/common/database/tenantScoped.repository';

export type AuthSessionType = 'normal' | 'password_change';

/**
 * Sessao opaca. O token cru nunca e persistido: a coluna guarda o SHA-256 e
 * ainda assim fica fora de todo `SELECT` padrao (`select: false`).
 */
@Entity('auth_sessions')
@Unique('auth_sessions_token_hash_unique', ['tokenHash'])
export class AuthSession implements TenantOwned {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  userId!: string;

  @Column({ type: 'char', length: 64, select: false })
  tokenHash!: string;

  @Column({ type: 'varchar', length: 24 })
  type!: AuthSessionType;

  /** Prazo absoluto da sessao. */
  @Column('timestamptz')
  expiresAt!: Date;

  /** Ultima requisicao aceita; base da janela de inatividade. */
  @Column('timestamptz')
  lastActivityAt!: Date;

  @Column('timestamptz', { nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  revokedReason!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column('timestamptz', { nullable: true })
  deletedAt!: Date | null;
}
