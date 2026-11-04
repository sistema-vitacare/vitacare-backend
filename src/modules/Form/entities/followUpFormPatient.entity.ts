import { Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';

import { Organization } from '@/modules/Organization/entities/organization.entity';
import { Patient } from '@/modules/Patient/entities/patient.entity';

import { FollowUpForm } from './followUpForm.entity';

/**
 * Paciente da lista a que o formulario se aplica (`audience = 'patients'`).
 * Retirar o paciente da lista grava `deletedAt`; a linha fica como historico.
 */
@Entity('follow_up_form_patients')
@Index('follow_up_form_patients_active_unique', { synchronize: false })
@Index('follow_up_form_patients_org_patient_idx', { synchronize: false })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'follow_up_form_patients_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => FollowUpForm,
  ['formId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_form_patients_form_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => Patient,
  ['patientId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_form_patients_patient_tenant_fk', onDelete: 'RESTRICT' },
)
export class FollowUpFormPatient {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  formId!: string;

  @Column('uuid')
  patientId!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
