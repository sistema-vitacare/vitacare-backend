import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { Organization } from '@/modules/Organization/entities/organization.entity';
import { User } from '@/modules/User/entities/user.entity';

import type { PushRevokedReason } from '../types/notification.types';

/**
 * Navegador inscrito no push (Web Push, PWA). Revogada = `deletedAt` com o
 * motivo: pelo usuario, substituida por outro usuario no mesmo navegador ou
 * expirada no servico de push.
 */
@Entity('push_subscriptions')
@Index('push_subscriptions_endpoint_active_unique', { synchronize: false })
@Index('push_subscriptions_user_idx', { synchronize: false })
@Unique('push_subscriptions_id_org_unique', ['id', 'organizationId'])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'push_subscriptions_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => User,
  ['userId', 'organizationId'],
  ['id', 'organizationId'],
  {
    name: 'push_subscriptions_user_tenant_fk',
    onDelete: 'RESTRICT',
  },
)
@Check(
  'push_subscriptions_revoked_check',
  '(deleted_at IS NULL) = (revoked_reason IS NULL)',
)
@Check(
  'push_subscriptions_revoked_reason_check',
  "revoked_reason IN ('user', 'replaced', 'expired')",
)
export class PushSubscription {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  userId!: string;

  @Column({ type: 'varchar', length: 1000 })
  endpoint!: string;

  @Column({ type: 'varchar', length: 200 })
  p256dh!: string;

  @Column({ type: 'varchar', length: 100 })
  auth!: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastSuccessAt!: Date | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  revokedReason!: PushRevokedReason | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
