import { Injectable } from '@nestjs/common';

import {
  AUDIT_PROFILE_NAMES,
  auditActionLabel,
} from '../policies/auditCatalog.policy';
import type { AuditEventRow } from '../types/auditEvent.types';

const HEADER = [
  'Data/hora',
  'Organização',
  'Usuário',
  'Perfil',
  'Ação',
  'Código da ação',
  'Gravidade',
  'Tipo do item',
  'Id do item',
  'Item',
  'IP',
  'Request id',
];

const SEPARATOR = ';';
const LINE_END = '\r\n';
const BOM = '\uFEFF';

const localParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

/** ISO 8601 no horario de Brasilia, com o deslocamento (ex.: -03:00). */
const localIso = (instant: Date): string => {
  const part = Object.fromEntries(
    localParts.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  const offset = part.timeZoneName.replace('GMT', '') || '+00:00';

  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}:${part.second}${offset}`;
};

/** Planilha nao executa formula vinda de dado (injecao de CSV). */
const neutralize = (value: string): string =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

const cell = (value: string | null): string => {
  const text = neutralize(value ?? '');

  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * CSV da auditoria (UC06 passo 5, Figura 45): UTF-8 com BOM e `;` para abrir
 * direto no Excel em portugues. Sem valores anterior/novo: ficam no detalhe.
 */
@Injectable()
export class AuditCsvService {
  render(rows: AuditEventRow[]): Buffer {
    const lines = [
      HEADER,
      ...rows.map((row) => [
        localIso(row.occurredAt),
        row.organizationName,
        row.actorType === 'system' ? 'Sistema' : (row.actorName ?? ''),
        row.actorProfileCode === null
          ? null
          : (AUDIT_PROFILE_NAMES[row.actorProfileCode] ?? row.actorProfileCode),
        auditActionLabel(row.action),
        row.action,
        row.severity,
        row.entityType,
        row.entityId,
        row.entityLabel,
        row.ipAddress,
        row.requestId,
      ]),
    ];

    return Buffer.from(
      BOM +
        lines.map((values) => values.map(cell).join(SEPARATOR)).join(LINE_END) +
        LINE_END,
      'utf8',
    );
  }
}
