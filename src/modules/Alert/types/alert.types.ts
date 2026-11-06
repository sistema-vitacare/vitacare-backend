import type { FormFrequency } from '@/modules/Form/types/form.types';
import type { PatientScope } from '@/modules/Patient/types/patient.types';

/** Operadores decididos por Mateus em 2026-11-05 (MER `operador ENUM`). */
export const ALERT_RULE_OPERATORS = ['gt', 'gte', 'lt', 'lte'] as const;

export type AlertRuleOperator = (typeof ALERT_RULE_OPERATORS)[number];

/** Rotulos da Figura 42, decididos por Mateus em 2026-11-05. */
export const ALERT_SEVERITIES = ['critical', 'warning', 'info'] as const;

export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_RULE_STATUSES = ['active', 'inactive'] as const;

export type AlertRuleStatus = (typeof ALERT_RULE_STATUSES)[number];

/** Origem: valor registrado (BE-15), ausencia e lembrete (BE-16). */
export const ALERT_SOURCES = [
  'reading',
  'absence',
  'medication_reminder',
] as const;

export type AlertSource = (typeof ALERT_SOURCES)[number];

/** Resolver vale para todos e guarda autor e data (BE-17). */
export const ALERT_STATUSES = ['open', 'resolved'] as const;

export type AlertStatus = (typeof ALERT_STATUSES)[number];

/** Tipos de campo que aceitam regra: os numericos. */
export const RULE_FIELD_TYPES = ['number', 'scale'] as const;

export interface NamedRef {
  id: string;
  name: string;
}

/** Campo da regra, lido da versao publicada mais recente que o contem. */
export interface RuleFieldRef {
  key: string;
  name: string;
  fieldType: string;
  unit: string | null;
}

/** Dados editaveis da regra. */
export interface AlertRuleFields {
  name: string;
  description: string | null;
  operator: AlertRuleOperator;
  referenceValue: number;
  severity: AlertSeverity;
}

export interface AlertRuleRow extends AlertRuleFields {
  id: string;
  form: { id: string; name: string };
  field: RuleFieldRef;
  patient: NamedRef | null;
  status: AlertRuleStatus;
  createdBy: NamedRef;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Organizacao, ator e requestId vem sempre da sessao, nunca do corpo. */
export interface AlertRuleActor {
  organizationId: string;
  actorUserId: string;
  requestId: string;
}

export interface CreateAlertRuleCommand
  extends AlertRuleActor, AlertRuleFields {
  formId: string;
  fieldKey: string;
  patientId: string | null;
}

export interface UpdateAlertRuleCommand extends AlertRuleActor {
  ruleId: string;
  fields: Partial<AlertRuleFields>;
}

export interface TargetAlertRuleCommand extends AlertRuleActor {
  ruleId: string;
}

export interface ListAlertRulesFilter {
  formId?: string;
  patientId?: string;
  status?: AlertRuleStatus;
  skip: number;
  take: number;
}

export type CreateAlertRuleOutcome =
  | { kind: 'created'; rule: AlertRuleRow }
  | {
      kind:
        | 'form_not_found'
        | 'form_inactive'
        | 'field_not_found'
        | 'field_not_numeric'
        | 'patient_not_found'
        | 'patient_inactive'
        | 'form_not_applicable';
    };

export type UpdateAlertRuleOutcome =
  | { kind: 'updated'; rule: AlertRuleRow }
  | { kind: 'not_found' | 'inactive' | 'unchanged' };

export type DeactivateAlertRuleOutcome =
  | { kind: 'deactivated'; rule: AlertRuleRow }
  | { kind: 'not_found' | 'already_inactive' };

export type ReactivateAlertRuleOutcome =
  | { kind: 'reactivated'; rule: AlertRuleRow }
  | { kind: 'not_found' | 'already_active' };

export interface AlertRow {
  id: string;
  patient: NamedRef;
  source: AlertSource;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  /** Origem `reading`; nulos nas demais. */
  rule: NamedRef | null;
  followUp: { id: string; visitedAt: Date; status: string } | null;
  field: { key: string; name: string; unit: string | null } | null;
  value: string | null;
  operator: AlertRuleOperator | null;
  referenceValue: number | null;
  /** Origem `absence` (BE-16). */
  absence: {
    form: NamedRef;
    since: Date;
    dueAt: Date;
    frequency: FormFrequency;
  } | null;
  /** Origem `medication_reminder` (BE-16). */
  medicationReminder: {
    medication: NamedRef;
    reminderId: string;
    scheduledAt: Date;
  } | null;
  generatedAt: Date;
  /** Resolvido: vale para todos, com autor e data (BE-17). */
  resolution: { resolvedAt: Date; resolvedBy: NamedRef } | null;
  /** Notificacao do proprio usuario da sessao, se ele foi destinatario. */
  notification: { id: string; readAt: Date | null } | null;
}

export interface ListAlertsFilter {
  patientId: string;
  severity?: AlertSeverity;
  status?: AlertStatus;
  skip: number;
  take: number;
}

export type ListAlertsOutcome =
  | { kind: 'ok'; items: AlertRow[]; total: number }
  | { kind: 'patient_not_found' };

/** Alcance de pacientes mais o usuario da sessao (`viewerId`). */
export interface AlertScope extends PatientScope {
  viewerId: string;
}

export type ResolveAlertOutcome =
  | { kind: 'resolved'; alert: AlertRow }
  | { kind: 'not_found' }
  | { kind: 'already_resolved' };

/** Par item x regra que bateu, base de um alerta. */
export interface AlertMatch {
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  operator: AlertRuleOperator;
  referenceValue: string;
  responseItemId: string;
  fieldKey: string;
  fieldName: string;
  fieldUnit: string | null;
  value: string;
}

export type EvaluateRecordOutcome =
  { kind: 'evaluated'; alerts: number } | { kind: 'skipped' };
