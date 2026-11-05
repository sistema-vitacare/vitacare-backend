import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';

import { FollowUpForm } from '@/modules/Form/entities/followUpForm.entity';
import { Organization } from '@/modules/Organization/entities/organization.entity';
import { Patient } from '@/modules/Patient/entities/patient.entity';

import type { AbsenceMonitorStatus } from '../types/automation.types';

/**
 * Par paciente x formulario monitorado para ausencia (acrescimo ao MER,
 * BE-16). Vale enquanto o par for elegivel; deixar de ser encerra a linha, e
 * voltar abre outra com contagem do zero. `checkedThrough` e o cursor: prazos
 * ate ali ja foram avaliados.
 */
@Entity('follow_up_absence_monitors')
@Index('follow_up_absence_monitors_active_unique', { synchronize: false })
@Index('follow_up_absence_monitors_due_idx', { synchronize: false })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'follow_up_absence_monitors_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => Patient,
  ['patientId', 'organizationId'],
  ['id', 'organizationId'],
  {
    name: 'follow_up_absence_monitors_patient_tenant_fk',
    onDelete: 'RESTRICT',
  },
)
@ForeignKey(
  () => FollowUpForm,
  ['formId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_absence_monitors_form_tenant_fk', onDelete: 'RESTRICT' },
)
@Check(
  'follow_up_absence_monitors_checked_check',
  'checked_through >= started_at',
)
@Check(
  'follow_up_absence_monitors_status_check',
  "status IN ('active', 'ended')",
)
@Check(
  'follow_up_absence_monitors_end_check',
  "(status = 'active') = (deleted_at IS NULL)",
)
export class FollowUpAbsenceMonitor {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  patientId!: string;

  @Column('uuid')
  formId!: string;

  @Column('timestamptz')
  startedAt!: Date;

  @Column('timestamptz')
  checkedThrough!: Date;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: AbsenceMonitorStatus;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
