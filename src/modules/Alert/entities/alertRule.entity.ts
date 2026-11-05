import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { FollowUpForm } from '@/modules/Form/entities/followUpForm.entity';
import { Organization } from '@/modules/Organization/entities/organization.entity';
import { Patient } from '@/modules/Patient/entities/patient.entity';
import { User } from '@/modules/User/entities/user.entity';

import type {
  AlertRuleOperator,
  AlertRuleStatus,
  AlertSeverity,
} from '../types/alert.types';

/**
 * Regra de alerta (MER `regras_alerta`). `formId` + `fieldKey` substituem
 * `id_campo_formulario`: a regra segue o campo atraves das versoes. Sem
 * `patientId` vale para todo paciente do formulario; com ele, substitui as
 * gerais do mesmo campo para esse paciente. `createdByUserId` e o
 * `id_usuario_configuracao`. Inativar grava `deletedAt` junto com o status.
 */
@Entity('alert_rules')
@Index('alert_rules_form_field_idx', { synchronize: false })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'alert_rules_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => FollowUpForm,
  ['formId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'alert_rules_form_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => Patient,
  ['patientId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'alert_rules_patient_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => User,
  ['createdByUserId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'alert_rules_created_by_tenant_fk', onDelete: 'RESTRICT' },
)
@Unique('alert_rules_id_org_unique', ['id', 'organizationId'])
@Check('alert_rules_name_check', "btrim(name) <> ''")
@Check('alert_rules_description_check', "btrim(description) <> ''")
@Check('alert_rules_operator_check', "operator IN ('gt', 'gte', 'lt', 'lte')")
@Check(
  'alert_rules_severity_check',
  "severity IN ('critical', 'warning', 'info')",
)
@Check('alert_rules_status_check', "status IN ('active', 'inactive')")
@Check(
  'alert_rules_deactivation_check',
  "(status = 'active') = (deleted_at IS NULL)",
)
export class AlertRule {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  formId!: string;

  @Column('uuid')
  fieldKey!: string;

  @Column({ type: 'uuid', nullable: true })
  patientId!: string | null;

  @Column('uuid')
  createdByUserId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 8 })
  operator!: AlertRuleOperator;

  @Column({ type: 'numeric', precision: 12, scale: 3 })
  referenceValue!: string;

  @Column({ type: 'varchar', length: 16 })
  severity!: AlertSeverity;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: AlertRuleStatus;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
