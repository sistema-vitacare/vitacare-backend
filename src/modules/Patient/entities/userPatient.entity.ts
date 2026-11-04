import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';

import { Organization } from '@/modules/Organization/entities/organization.entity';
import { User } from '@/modules/User/entities/user.entity';

import type { PatientLinkRole } from '../types/patient.types';
import { Patient } from './patient.entity';

/**
 * Vinculo usuario-paciente (MER `usuarios_pacientes`). No BE-09 so existe o
 * profissional responsavel; `linkType` e `note` ficam nulos ate o BE-10.
 * `deletedAt` encerra o vinculo sem apagar quem foi responsavel.
 */
@Entity('user_patients')
@Index('user_patients_single_responsible_unique', { synchronize: false })
@Index('user_patients_org_user_idx', { synchronize: false })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'user_patients_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => User,
  ['userId', 'organizationId'],
  ['id', 'organizationId'],
  {
    name: 'user_patients_user_tenant_fk',
    onDelete: 'RESTRICT',
  },
)
@ForeignKey(
  () => Patient,
  ['patientId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'user_patients_patient_tenant_fk', onDelete: 'RESTRICT' },
)
@Check('user_patients_role_check', "role IN ('responsible_professional')")
export class UserPatient {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  userId!: string;

  @Column('uuid')
  patientId!: string;

  @Column({ type: 'varchar', length: 40 })
  role!: PatientLinkRole;

  @Column({ type: 'varchar', length: 40, nullable: true })
  linkType!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
