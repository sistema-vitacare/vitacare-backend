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
 * resposta (`id_lembrete_medicamento` e ausencia ficam para o BE-16). Campo,
 * valor, operador e referencia sao a copia do momento do disparo; editar a
 * regra depois nao reescreve o historico. `generatedAt` e a `data_geracao`;
 * leitura e resolucao (`data_visualizacao`) ficam para o BE-17.
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
@Unique('alerts_rule_item_unique', ['ruleId', 'responseItemId'])
@Check('alerts_source_check', "source IN ('reading')")
@Check(
  'alerts_reading_origin_check',
  "source <> 'reading' OR (rule_id IS NOT NULL AND follow_up_record_id IS NOT NULL AND response_item_id IS NOT NULL AND field_key IS NOT NULL AND field_name IS NOT NULL AND value IS NOT NULL AND operator IS NOT NULL AND reference_value IS NOT NULL)",
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

  @Column({ type: 'varchar', length: 16 })
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

  @Column({ type: 'timestamptz', default: () => 'now()' })
  generatedAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
