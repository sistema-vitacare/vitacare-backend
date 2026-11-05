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

import type { MedicationReminderStatus } from '../types/medication.types';
import { Medication } from './medication.entity';

/**
 * Um horario da agenda (MER `lembretes_medicamentos`): `timeOfDay` local de
 * Brasilia, repetido a cada `intervalDays` dias desde `startDate`. A linha
 * vale de `createdAt` ate `deletedAt`; mudar a agenda encerra a linha e cria
 * outra, entao um disparo so e valido se cair nesse intervalo.
 * `dispatchedThrough` e o cursor do BE-16: horarios ate ali ja geraram
 * lembrete (nulo = desde `createdAt`); `nextDispatchAt` e o proximo horario
 * (nulo = calcular; `infinity` = agenda encerrada).
 */
@Entity('medication_reminders')
@Index('medication_reminders_active_time_unique', { synchronize: false })
@Index('medication_reminders_medication_idx', { synchronize: false })
@Index('medication_reminders_due_idx', { synchronize: false })
@Unique('medication_reminders_id_org_unique', ['id', 'organizationId'])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'medication_reminders_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => Medication,
  ['medicationId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'medication_reminders_medication_tenant_fk', onDelete: 'RESTRICT' },
)
@Check('medication_reminders_period_check', 'end_date >= start_date')
@Check(
  'medication_reminders_interval_days_check',
  'interval_days BETWEEN 1 AND 30',
)
@Check('medication_reminders_status_check', "status IN ('active', 'ended')")
@Check(
  'medication_reminders_end_check',
  "(status = 'active') = (deleted_at IS NULL)",
)
export class MedicationReminder {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  medicationId!: string;

  @Column('date')
  startDate!: string;

  @Column({ type: 'date', nullable: true })
  endDate!: string | null;

  @Column('smallint')
  intervalDays!: number;

  @Column({ type: 'time', precision: 0 })
  timeOfDay!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: MedicationReminderStatus;

  @Column({ type: 'timestamptz', nullable: true })
  dispatchedThrough!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextDispatchAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
