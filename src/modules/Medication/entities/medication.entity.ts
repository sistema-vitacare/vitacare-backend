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
import { Patient } from '@/modules/Patient/entities/patient.entity';
import { User } from '@/modules/User/entities/user.entity';

import type {
  MedicationDoseUnit,
  MedicationRoute,
  MedicationStatus,
} from '../types/medication.types';

/**
 * Medicamento do paciente (MER `medicamentos`). `doseAmount` + `doseUnit`
 * substituem `dosagem_mg`; `route` vem do DER. Os horarios ficam em
 * `medication_reminders`. Inativar grava `deletedAt` junto com o status.
 */
@Entity('medications')
@Index('medications_patient_status_idx', [
  'organizationId',
  'patientId',
  'status',
])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'medications_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => Patient,
  ['patientId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'medications_patient_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => User,
  ['createdByUserId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'medications_created_by_tenant_fk', onDelete: 'RESTRICT' },
)
@Unique('medications_id_org_unique', ['id', 'organizationId'])
@Check('medications_name_check', "btrim(name) <> ''")
@Check('medications_notes_check', "btrim(notes) <> ''")
@Check('medications_dose_amount_check', 'dose_amount > 0')
@Check(
  'medications_dose_unit_check',
  "dose_unit IN ('mg', 'mcg', 'g', 'ml', 'iu', 'drops', 'tablet', 'capsule', 'application')",
)
@Check(
  'medications_route_check',
  "route IN ('oral', 'sublingual', 'topical', 'transdermal', 'inhalation', 'nasal', 'ophthalmic', 'otic', 'rectal', 'vaginal', 'subcutaneous', 'intramuscular', 'intravenous', 'other')",
)
@Check('medications_status_check', "status IN ('active', 'inactive')")
@Check(
  'medications_deactivation_check',
  "(status = 'active') = (deleted_at IS NULL)",
)
export class Medication {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  patientId!: string;

  @Column('uuid')
  createdByUserId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  /** `numeric(10,3)`: o driver devolve texto. */
  @Column({ type: 'numeric', precision: 10, scale: 3 })
  doseAmount!: string;

  @Column({ type: 'varchar', length: 16 })
  doseUnit!: MedicationDoseUnit;

  @Column({ type: 'varchar', length: 24, nullable: true })
  route!: MedicationRoute | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  notes!: string | null;

  @Column({ type: 'boolean', default: false })
  remindersEnabled!: boolean;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: MedicationStatus;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
