import { Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';

import { Organization } from '@/modules/Organization/entities/organization.entity';
import { User } from '@/modules/User/entities/user.entity';

/**
 * Preferencias de recebimento do usuario (UC13, "configuracoes de
 * recebimento"): uma chave por origem x canal, ligada por padrao, e o opt-in
 * do admin para receber os alertas da organizacao inteira. Sem linha =
 * padroes.
 */
@Entity('notification_preferences')
@Unique('notification_preferences_user_unique', ['userId'])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'notification_preferences_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => User,
  ['userId', 'organizationId'],
  ['id', 'organizationId'],
  {
    name: 'notification_preferences_user_tenant_fk',
    onDelete: 'RESTRICT',
  },
)
export class NotificationPreference {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  userId!: string;

  @Column({ type: 'boolean', default: false })
  organizationAlerts!: boolean;

  @Column({ type: 'boolean', default: true })
  readingInApp!: boolean;

  @Column({ type: 'boolean', default: true })
  readingPush!: boolean;

  @Column({ type: 'boolean', default: true })
  readingEmail!: boolean;

  @Column({ type: 'boolean', default: true })
  absenceInApp!: boolean;

  @Column({ type: 'boolean', default: true })
  absencePush!: boolean;

  @Column({ type: 'boolean', default: true })
  absenceEmail!: boolean;

  @Column({ type: 'boolean', default: true })
  medicationReminderInApp!: boolean;

  @Column({ type: 'boolean', default: true })
  medicationReminderPush!: boolean;

  @Column({ type: 'boolean', default: true })
  medicationReminderEmail!: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
