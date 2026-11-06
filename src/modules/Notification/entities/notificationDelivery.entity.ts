import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';

import { Organization } from '@/modules/Organization/entities/organization.entity';

import type {
  DeliveryChannel,
  DeliveryStatus,
} from '../types/notification.types';
import { AlertNotification } from './alertNotification.entity';
import { PushSubscription } from './pushSubscription.entity';

/**
 * Envio de uma notificacao por push (uma por inscricao) ou e-mail.
 * `nextAttemptAt` e a proxima tentativa e tambem o prazo da reserva durante o
 * envio; `lastErrorCode` diz por que falhou ou foi pulada, sem dado pessoal.
 */
@Entity('notification_deliveries')
@Index('notification_deliveries_push_unique', { synchronize: false })
@Index('notification_deliveries_email_unique', { synchronize: false })
@Index('notification_deliveries_due_idx', { synchronize: false })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'notification_deliveries_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => AlertNotification,
  ['notificationId', 'organizationId'],
  ['id', 'organizationId'],
  {
    name: 'notification_deliveries_notification_tenant_fk',
    onDelete: 'RESTRICT',
  },
)
@ForeignKey(
  () => PushSubscription,
  ['pushSubscriptionId', 'organizationId'],
  ['id', 'organizationId'],
  {
    name: 'notification_deliveries_subscription_tenant_fk',
    onDelete: 'RESTRICT',
  },
)
@Check('notification_deliveries_channel_check', "channel IN ('push', 'email')")
@Check(
  'notification_deliveries_target_check',
  "(channel = 'push') = (push_subscription_id IS NOT NULL)",
)
@Check(
  'notification_deliveries_status_check',
  "status IN ('pending', 'sent', 'failed', 'skipped')",
)
@Check(
  'notification_deliveries_sent_check',
  "(status = 'sent') = (sent_at IS NOT NULL)",
)
@Check('notification_deliveries_attempts_check', 'attempts >= 0')
export class NotificationDelivery {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  notificationId!: string;

  @Column({ type: 'varchar', length: 8 })
  channel!: DeliveryChannel;

  @Column({ type: 'uuid', nullable: true })
  pushSubscriptionId!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: DeliveryStatus;

  @Column({ type: 'smallint', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt!: Date;

  @Column({ type: 'varchar', length: 40, nullable: true })
  lastErrorCode!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
