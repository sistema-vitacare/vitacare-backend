import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

import type { TenantOwned } from '@/common/database/tenantScoped.repository';

/**
 * Convite por link do UC03 (BE-31): uso unico, so o SHA-256 chega ao banco.
 * Separado de `password_reset_tokens` porque exige usuario `pending`, enquanto
 * a recuperacao exige `active`; um token nunca serve no fluxo do outro.
 */
@Entity('user_invitations')
@Unique('user_invitations_token_hash_unique', ['tokenHash'])
export class UserInvitation implements TenantOwned {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  userId!: string;

  @Column('uuid')
  invitedByUserId!: string;

  @Column({ type: 'char', length: 64, select: false })
  tokenHash!: string;

  @Column('timestamptz')
  expiresAt!: Date;

  @Column('timestamptz', { nullable: true })
  sentAt!: Date | null;

  @Column('timestamptz', { nullable: true })
  consumedAt!: Date | null;

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
