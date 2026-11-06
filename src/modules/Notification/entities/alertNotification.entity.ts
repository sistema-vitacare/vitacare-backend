import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { Alert } from '@/modules/Alert/entities/alert.entity';
import { Organization } from '@/modules/Organization/entities/organization.entity';
import { User } from '@/modules/User/entities/user.entity';

import type { NotificationReason } from '../types/notification.types';

/**
 * Destinatario de um alerta (DER "Usuario Recebe Alerta"; o MER nao o tem),
 * escolhido quando o alerta e gerado. `inApp` diz se aparece na caixa interna;
 * `readAt` e a leitura individual, que substitui a `data_visualizacao` global
 * do MER.
 */
@Entity('alert_notifications')
@Index('alert_notifications_inbox_idx', { synchronize: false })
@Unique('alert_notifications_id_org_unique', ['id', 'organizationId'])
@Unique('alert_notifications_alert_user_unique', ['alertId', 'userId'])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'alert_notifications_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => Alert,
  ['alertId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'alert_notifications_alert_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => User,
  ['userId', 'organizationId'],
  ['id', 'organizationId'],
  {
    name: 'alert_notifications_user_tenant_fk',
    onDelete: 'RESTRICT',
  },
)
@Check(
  'alert_notifications_reason_check',
  "reason IN ('patient_link', 'organization_admin')",
)
export class AlertNotification {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  alertId!: string;

  @Column('uuid')
  userId!: string;

  @Column({ type: 'varchar', length: 24 })
  reason!: NotificationReason;

  @Column('boolean')
  inApp!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
