import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import type { DeliveryStatus } from '@/modules/Notification/types/notification.types';
import { Organization } from '@/modules/Organization/entities/organization.entity';
import { User } from '@/modules/User/entities/user.entity';

import { PlanExpiryNotice } from './planExpiryNotice.entity';

/**
 * E-mail do aviso de vencimento para um administrador (BE-28), um por aviso e
 * usuario. Mesmo ciclo das entregas do BE-17: `nextAttemptAt` e a proxima
 * tentativa e o prazo da reserva; `lastErrorCode` diz por que falhou ou foi
 * pulada, sem dado pessoal.
 */
@Entity('plan_expiry_notice_deliveries')
@Index('plan_expiry_notice_deliveries_due_idx', { synchronize: false })
@Unique('plan_expiry_notice_deliveries_notice_user_unique', [
  'noticeId',
  'userId',
])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'plan_expiry_notice_deliveries_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => PlanExpiryNotice,
  ['noticeId', 'organizationId'],
  ['id', 'organizationId'],
  {
    name: 'plan_expiry_notice_deliveries_notice_tenant_fk',
    onDelete: 'RESTRICT',
  },
)
@ForeignKey(
  () => User,
  ['userId', 'organizationId'],
  ['id', 'organizationId'],
  {
    name: 'plan_expiry_notice_deliveries_user_tenant_fk',
    onDelete: 'RESTRICT',
  },
)
@Check(
  'plan_expiry_notice_deliveries_status_check',
  "status IN ('pending', 'sent', 'failed', 'skipped')",
)
@Check(
  'plan_expiry_notice_deliveries_sent_check',
  "(status = 'sent') = (sent_at IS NOT NULL)",
)
@Check('plan_expiry_notice_deliveries_attempts_check', 'attempts >= 0')
export class PlanExpiryNoticeDelivery {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  noticeId!: string;

  @Column('uuid')
  userId!: string;

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
