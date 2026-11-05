import type { RequestContext } from '@/common/context/requestContext.type';

import type { AlertRuleDto } from '../dtos/alertRule.dto';
import type { AlertRuleFields, AlertRuleRow } from '../types/alert.types';
import type { UpdateAlertRuleDto } from '../UpdateAlertRule/updateAlertRule.dto';

const FIELD_KEYS = [
  'name',
  'description',
  'operator',
  'referenceValue',
  'severity',
] as const satisfies ReadonlyArray<keyof AlertRuleFields>;

/** Corpo de edicao -> so o que veio. */
export const toAlertRulePatch = (
  input: UpdateAlertRuleDto,
): Partial<AlertRuleFields> =>
  Object.fromEntries(
    FIELD_KEYS.filter((key) => input[key] !== undefined).map((key) => [
      key,
      input[key],
    ]),
  );

/** Regra -> resposta. So admin e profissional chegam aqui. */
export const toAlertRuleResponse = (
  row: AlertRuleRow,
  _ctx: RequestContext,
): AlertRuleDto => ({
  id: row.id,
  form: row.form,
  field: row.field,
  patient: row.patient,
  name: row.name,
  description: row.description,
  operator: row.operator,
  referenceValue: Number(row.referenceValue),
  severity: row.severity,
  status: row.status,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deactivatedAt: row.deletedAt?.toISOString() ?? null,
});
