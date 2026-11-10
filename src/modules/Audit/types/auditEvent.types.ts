import type { AuditSeverity } from '../policies/auditCatalog.policy';

export const AUDIT_ACTOR_TYPES = ['user', 'system'] as const;

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/** Limite do CSV por pedido; acima, o usuario estreita o filtro. */
export const AUDIT_EXPORT_MAX_EVENTS = 10_000;

export const AUDIT_EMPTY_MESSAGE =
  'Nenhum evento de auditoria para os filtros selecionados.';

export interface AuditEventRow {
  id: string;
  occurredAt: Date;
  organizationId: string;
  organizationName: string;
  actorType: AuditActorType;
  actorUserId: string | null;
  actorName: string | null;
  actorProfileCode: string | null;
  action: string;
  severity: AuditSeverity;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  ipAddress: string | null;
  requestId: string | null;
  beforeValues: Record<string, unknown> | null;
  afterValues: Record<string, unknown> | null;
}

export interface AuditEventFilter {
  /** `null`: todas as organizacoes (so o master). */
  organizationId: string | null;
  /** Organizacao da sessao: a busca por nome so procura nela (nomes de fora saem mascarados). */
  viewerOrganizationId: string;
  period: { from: string; to: string };
  action?: string;
  severity?: AuditSeverity;
  actorUserId?: string;
  actorType?: AuditActorType;
  search?: { term: string; actions: string[] };
}
