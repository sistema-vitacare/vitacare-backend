import { Injectable } from '@nestjs/common';

import type { AuditActionDto } from '../dtos/auditEvent.dto';
import { AUDIT_ACTIONS } from '../policies/auditCatalog.policy';

/** Opcoes do filtro "Acao" da Figura 45. */
@Injectable()
export class ListAuditActionsUseCase {
  execute(): AuditActionDto[] {
    return Object.entries(AUDIT_ACTIONS).map(([action, entry]) => ({
      action,
      label: entry.label,
      severity: entry.severity,
    }));
  }
}
