import type {
  AuditEventDetailDto,
  AuditEventDto,
} from '../dtos/auditEvent.dto';
import {
  AUDIT_PROFILE_NAMES,
  auditActionLabel,
} from '../policies/auditCatalog.policy';
import type { AuditEventRow } from '../types/auditEvent.types';

const MASK = '********';
const SENSITIVE_KEY = /password|token|secret|hash/i;

/** Defesa em profundidade: a gravacao ja nao guarda esses dados. */
const mask = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(mask);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      SENSITIVE_KEY.test(key) ? MASK : mask(inner),
    ]),
  );
};

const maskValues = (values: Record<string, unknown> | null) =>
  values === null ? null : (mask(values) as Record<string, unknown>);

export const toAuditEventResponse = (row: AuditEventRow): AuditEventDto => ({
  id: row.id,
  occurredAt: row.occurredAt.toISOString(),
  organization: { id: row.organizationId, name: row.organizationName },
  actor: {
    type: row.actorType,
    user:
      row.actorUserId === null
        ? null
        : { id: row.actorUserId, name: row.actorName ?? '' },
    profile:
      row.actorProfileCode === null
        ? null
        : {
            code: row.actorProfileCode,
            name:
              AUDIT_PROFILE_NAMES[row.actorProfileCode] ?? row.actorProfileCode,
          },
  },
  action: row.action,
  actionLabel: auditActionLabel(row.action),
  severity: row.severity,
  entity: { type: row.entityType, id: row.entityId, label: row.entityLabel },
  ipAddress: row.ipAddress,
  requestId: row.requestId,
});

export const toAuditEventDetailResponse = (
  row: AuditEventRow,
): AuditEventDetailDto => ({
  ...toAuditEventResponse(row),
  beforeValues: maskValues(row.beforeValues),
  afterValues: maskValues(row.afterValues),
});
