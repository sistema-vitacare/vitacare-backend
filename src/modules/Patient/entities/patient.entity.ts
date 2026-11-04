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

import type { PatientSex, PatientStatus } from '../types/patient.types';

/**
 * Paciente acompanhado pela organizacao (MER `pacientes` + Figura 35). O
 * status e so cadastral; situacao clinica nao e gravada aqui.
 */
@Entity('patients')
@Index('patients_org_cpf_unique', { synchronize: false })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'patients_organization_fk',
  onDelete: 'RESTRICT',
})
@Unique('patients_id_org_unique', ['id', 'organizationId'])
@Index('patients_org_status_name_idx', ['organizationId', 'status', 'name'])
@Check('patients_name_check', "btrim(name) <> ''")
@Check('patients_sex_check', "sex IN ('female', 'male', 'other')")
@Check('patients_cpf_format_check', "cpf ~ '^[0-9]{11}$'")
@Check('patients_zip_code_format_check', "zip_code ~ '^[0-9]{8}$'")
@Check('patients_state_format_check', "state ~ '^[A-Z]{2}$'")
@Check('patients_status_check', "status IN ('active', 'inactive')")
@Check(
  'patients_deactivation_check',
  "(status = 'inactive') = (deleted_at IS NOT NULL)",
)
export class Patient {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column({ type: 'varchar', length: 180 })
  name!: string;

  @Column({ type: 'date' })
  birthDate!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  sex!: PatientSex | null;

  @Column({ type: 'varchar', length: 11, nullable: true })
  cpf!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ type: 'citext', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  zipCode!: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  street!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  addressNumber!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  addressComplement!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  district!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  state!: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  mainCondition!: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  secondaryConditions!: string[];

  @Column({ type: 'varchar', length: 180, nullable: true })
  healthPlan!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: PatientStatus;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
