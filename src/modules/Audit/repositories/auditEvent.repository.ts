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

export interface AuditActor {
  userId: string;
  organizationId: string;
  requestId: string;
}

/**
 * O evento fica na organizacao alvo e, quando quem age e a plataforma, tambem
 * na organizacao do ator: a FK de autoria nao aceita autor de outro tenant,
 * entao no alvo ele entra como evento de sistema.
 */
export const insertAuditEventForTarget = async (
  manager: EntityManager,
  actor: AuditActor,
  event: Pick<AuditEventInput, 'action' | 'entityType' | 'entityId'> & {
    organizationId: string;
    afterValues?: Record<string, unknown> | null;
  },
): Promise<void> => {
  const sameOrganization = actor.organizationId === event.organizationId;
  const afterValues = event.afterValues ?? null;

  await insertAuditEvent(manager, {
    ...event,
    actorUserId: sameOrganization ? actor.userId : null,
    afterValues: sameOrganization
      ? afterValues
      : { ...afterValues, platformActorUserId: actor.userId },
    requestId: actor.requestId,
  });

  if (!sameOrganization) {
    await insertAuditEvent(manager, {
      ...event,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      afterValues,
      requestId: actor.requestId,
    });
  }
};
