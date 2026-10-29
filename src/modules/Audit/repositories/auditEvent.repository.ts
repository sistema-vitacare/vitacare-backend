import type { EntityManager } from 'typeorm';

export interface AuditEventInput {
  organizationId: string;
  /** `null` grava evento de sistema, como exige `audit_events_actor_check`. */
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  afterValues?: Record<string, unknown> | null;
  requestId: string | null;
}

/** Somente campos autorizados e mascarados podem entrar em `afterValues`. */
export const insertAuditEvent = async (
  manager: EntityManager,
  event: AuditEventInput,
): Promise<void> => {
  await manager.query(
    `INSERT INTO audit_events
       (organization_id, actor_type, actor_user_id, action, entity_type, entity_id, after_values, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      event.organizationId,
      event.actorUserId === null ? 'system' : 'user',
      event.actorUserId,
      event.action,
      event.entityType,
      event.entityId,
      event.afterValues ? JSON.stringify(event.afterValues) : null,
      event.requestId,
    ],
  );
};
