import type { RequestContext } from '@/common/context/requestContext.type';

import type { AlertDto } from '../dtos/alert.dto';
import type { AlertRow } from '../types/alert.types';

/**
 * Alerta -> resposta. O `ctx` e onde a visao simplificada do familiar
 * entrara (BE-19).
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
  followUp: {
    id: row.followUp.id,
    visitedAt: row.followUp.visitedAt.toISOString(),
    status: row.followUp.status,
  },
  field: row.field,
  value: row.value,
  operator: row.operator,
  referenceValue: Number(row.referenceValue),
  generatedAt: row.generatedAt.toISOString(),
});
