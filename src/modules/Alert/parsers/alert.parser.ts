import type { RequestContext } from '@/common/context/requestContext.type';

import type { AlertDto } from '../dtos/alert.dto';
import type { AlertRow } from '../types/alert.types';

/**
 * Alerta -> resposta, igual para todos os perfis: o familiar le o alerta
 * completo (BE-19, decisao de 2026-11-06).
 */
export const toAlertResponse = (
  row: AlertRow,
  _ctx: RequestContext,
): AlertDto => ({
  id: row.id,
  patient: row.patient,
  source: row.source,
  severity: row.severity,
  status: row.status,
  title: row.title,
  message: row.message,
  rule: row.rule,
  followUp: row.followUp && {
    id: row.followUp.id,
    visitedAt: row.followUp.visitedAt.toISOString(),
    status: row.followUp.status,
  },
  field: row.field,
  value: row.value,
  operator: row.operator,
  referenceValue: row.referenceValue,
  absence: row.absence && {
    form: row.absence.form,
    since: row.absence.since.toISOString(),
    dueAt: row.absence.dueAt.toISOString(),
    frequency: row.absence.frequency,
  },
  medicationReminder: row.medicationReminder && {
    medication: row.medicationReminder.medication,
    reminderId: row.medicationReminder.reminderId,
    scheduledAt: row.medicationReminder.scheduledAt.toISOString(),
  },
  generatedAt: row.generatedAt.toISOString(),
  resolution: row.resolution && {
    resolvedAt: row.resolution.resolvedAt.toISOString(),
    resolvedBy: row.resolution.resolvedBy,
  },
  notification: row.notification && {
    id: row.notification.id,
    readAt: row.notification.readAt?.toISOString() ?? null,
  },
});
