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

import type { FollowUpStatus } from '../types/followUp.types';

/**
 * Registro de visita (MER `registros_acompanhamento`). `createdAt` e o envio;
 * `visitedAt`, a hora da visita informada pelo cuidador. Anular grava
 * `deletedAt`, autor e motivo; o registro anulado continua no historico.
 * `alertsEvaluatedAt` nulo marca o registro ainda nao avaliado pelas regras de
 * alerta (BE-15); `alertsEvaluationFailedAt` adia a varredura apos uma falha.
 */
@Entity('follow_up_records')
@Index('follow_up_records_patient_visit_idx', { synchronize: false })
@Index('follow_up_records_alerts_pending_idx', { synchronize: false })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'follow_up_records_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => Patient,
  ['patientId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_records_patient_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => User,
  ['authorUserId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_records_author_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => User,
  ['annulledByUserId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'follow_up_records_annulled_by_tenant_fk', onDelete: 'RESTRICT' },
)
@Unique('follow_up_records_id_org_unique', ['id', 'organizationId'])
@Check('follow_up_records_notes_check', "btrim(notes) <> ''")
@Check('follow_up_records_status_check', "status IN ('valid', 'annulled')")
@Check(
  'follow_up_records_annulment_check',
  "(status = 'valid' AND deleted_at IS NULL AND annulled_by_user_id IS NULL AND annulment_reason IS NULL) OR (status = 'annulled' AND deleted_at IS NOT NULL AND annulled_by_user_id IS NOT NULL AND annulment_reason IS NOT NULL AND btrim(annulment_reason) <> '')",
)
export class FollowUpRecord {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  patientId!: string;

  @Column('uuid')
  authorUserId!: string;

  @Column({ type: 'timestamptz' })
  visitedAt!: Date;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'valid' })
  status!: FollowUpStatus;

  @Column({ type: 'uuid', nullable: true })
  annulledByUserId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  annulmentReason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  alertsEvaluatedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  alertsEvaluationFailedAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
