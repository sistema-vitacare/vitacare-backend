import type { AuditEventRow } from '../types/auditEvent.types';

/** Itens cujo nome e de uma pessoa. */
const PERSON_ENTITIES = new Set(['user', 'patient']);

/** "Paulo Lima" -> "P**** L***": a inicial de cada palavra e o tamanho. */
export const maskPersonName = (name: string): string =>
  name
    .split(/(\s+)/)
    .map((part) => {
      const chars = Array.from(part);

      return /^\s*$/.test(part) || chars.length <= 1
        ? part
        : chars[0] + '*'.repeat(chars.length - 1);
    })
    .join('');

const masked = (name: string | null) =>
  name === null ? null : maskPersonName(name);

/**
 * O master ve a auditoria de todas as organizacoes, mas os nomes de pessoas
 * de outra organizacao saem mascarados (decisao de Mateus, 2026-11-09).
 */
export const maskForeignPersonalData = (
  row: AuditEventRow,
  viewerOrganizationId: string,
): AuditEventRow =>
  row.organizationId === viewerOrganizationId
    ? row
    : {
        ...row,
        actorName: masked(row.actorName),
        entityLabel: PERSON_ENTITIES.has(row.entityType)
          ? masked(row.entityLabel)
          : row.entityLabel,
      };
