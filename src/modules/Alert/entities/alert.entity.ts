import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { FollowUpRecord } from '@/modules/FollowUp/entities/followUpRecord.entity';
import { FollowUpResponseItem } from '@/modules/FollowUp/entities/followUpResponseItem.entity';
import { FollowUpForm } from '@/modules/Form/entities/followUpForm.entity';
import type { FrequencyUnit } from '@/modules/Form/types/form.types';
import { Medication } from '@/modules/Medication/entities/medication.entity';
import { MedicationReminder } from '@/modules/Medication/entities/medicationReminder.entity';
import { Organization } from '@/modules/Organization/entities/organization.entity';
import { Patient } from '@/modules/Patient/entities/patient.entity';

import type {
  AlertRuleOperator,
  AlertSeverity,
  AlertSource,
  AlertStatus,
} from '../types/alert.types';
import { AlertRule } from './alertRule.entity';

/**
 * Alerta gerado (MER `alertas`). Origem `reading`: regra + registro + item de
 * resposta, com campo, valor, operador e referencia copiados no disparo.
 * Origem `absence` (BE-16): formulario, ultimo envio (`absenceSince`), prazo
 * vencido (`dueAt`) e copia da frequencia. Origem `medication_reminder`
 * (`id_lembrete_medicamento`): medicamento, linha da agenda e horario
 * programado (`scheduledAt`). `generatedAt` e a `data_geracao`, quando o
 * evento saiu; leitura e resolucao (`data_visualizacao`) ficam para o BE-17.
 */
@Entity('alerts')
@Index('alerts_patient_generated_idx', { synchronize: false })
@Index('alerts_record_idx', ['organizationId', 'followUpRecordId'])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'alerts_organization_fk',
  onDelete: 'RESTRICT',
})
@ForeignKey(
  () => Patient,
  ['patientId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'alerts_patient_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => AlertRule,
  ['ruleId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'alerts_rule_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => FollowUpRecord,
  ['followUpRecordId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'alerts_record_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => FollowUpResponseItem,
  ['responseItemId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'alerts_response_item_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => FollowUpForm,
  ['formId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'alerts_form_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => Medication,
  ['medicationId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'alerts_medication_tenant_fk', onDelete: 'RESTRICT' },
)
@ForeignKey(
  () => MedicationReminder,
  ['medicationReminderId', 'organizationId'],
  ['id', 'organizationId'],
  { name: 'alerts_medication_reminder_tenant_fk', onDelete: 'RESTRICT' },
)
@Unique('alerts_rule_item_unique', ['ruleId', 'responseItemId'])
@Unique('alerts_absence_due_unique', ['patientId', 'formId', 'dueAt'])
@Unique('alerts_reminder_occurrence_unique', [
  'medicationReminderId',
  'scheduledAt',
])
@Check(
  'alerts_source_check',
  "source IN ('reading', 'absence', 'medication_reminder')",
)
@Check(
  'alerts_reading_origin_check',
  "source <> 'reading' OR (rule_id IS NOT NULL AND follow_up_record_id IS NOT NULL AND response_item_id IS NOT NULL AND field_key IS NOT NULL AND field_name IS NOT NULL AND value IS NOT NULL AND operator IS NOT NULL AND reference_value IS NOT NULL)",
)
@Check(
  'alerts_absence_origin_check',
  "source <> 'absence' OR (form_id IS NOT NULL AND absence_since IS NOT NULL AND due_at IS NOT NULL AND frequency_interval IS NOT NULL AND frequency_unit IS NOT NULL)",
)
@Check(
  'alerts_reminder_origin_check',
  "source <> 'medication_reminder' OR (medication_id IS NOT NULL AND medication_reminder_id IS NOT NULL AND scheduled_at IS NOT NULL)",
)
@Check(
  'alerts_frequency_interval_check',
  'frequency_interval BETWEEN 1 AND 365',
)
@Check(
  'alerts_frequency_unit_check',
  "frequency_unit IN ('hours', 'days', 'weeks')",
)
@Check('alerts_title_check', "btrim(title) <> ''")
@Check('alerts_message_check', "btrim(message) <> ''")
@Check('alerts_severity_check', "severity IN ('critical', 'warning', 'info')")
@Check('alerts_operator_check', "operator IN ('gt', 'gte', 'lt', 'lte')")
@Check('alerts_status_check', "status IN ('open')")
export class Alert {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  patientId!: string;

  @Column({ type: 'varchar', length: 24 })
  source!: AlertSource;

  @Column({ type: 'uuid', nullable: true })
  ruleId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  followUpRecordId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  responseItemId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 500 })
  message!: string;

  @Column({ type: 'varchar', length: 16 })
  severity!: AlertSeverity;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: AlertStatus;

  @Column({ type: 'uuid', nullable: true })
  fieldKey!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  fieldName!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fieldUnit!: string | null;

  @Column({ type: 'text', nullable: true })
  value!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  operator!: AlertRuleOperator | null;

  @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
  referenceValue!: string | null;

  @Column({ type: 'uuid', nullable: true })
  formId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  absenceSince!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ type: 'smallint', nullable: true })
  frequencyInterval!: number | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  frequencyUnit!: FrequencyUnit | null;

  @Column({ type: 'uuid', nullable: true })
  medicationId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  medicationReminderId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  generatedAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
