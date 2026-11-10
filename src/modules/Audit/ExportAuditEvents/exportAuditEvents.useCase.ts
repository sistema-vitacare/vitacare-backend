import { Injectable, StreamableFile } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';

import { AuditErrors } from '../audit.errors';
import type { AuditEventFilterQueryDto } from '../dtos/auditEvent.dto';
import { maskForeignPersonalData } from '../policies/auditPersonalData.policy';
import { resolveAuditFilter } from '../policies/auditFilter.policy';
import { AuditEventQueryRepository } from '../repositories/auditEventQuery.repository';
import { AuditCsvService } from '../services/auditCsv.service';
import { AUDIT_EXPORT_MAX_EVENTS } from '../types/auditEvent.types';

/**
 * Exportacao CSV (UC06 passo 5; decisoes de Mateus, 2026-11-09): gerada na
 * hora, sem guardar arquivo, auditada so depois de pronta. Falha ao gerar nao
 * audita; a nova tentativa e repetir o pedido, reautorizado.
 */
@Injectable()
export class ExportAuditEventsUseCase {
  constructor(
    private readonly events: AuditEventQueryRepository,
    private readonly csv: AuditCsvService,
  ) {}

  async execute(
    query: AuditEventFilterQueryDto,
    ctx: RequestContext,
    today: string = todayInBrazil(),
  ): Promise<StreamableFile> {
    const filter = resolveAuditFilter(query, ctx, today);
    const total = await this.events.count(filter);

    if (total > AUDIT_EXPORT_MAX_EVENTS) {
      throw new DomainException({
        ...AuditErrors.EXPORT_TOO_MANY_EVENTS,
        detail: `${total} eventos no filtro; o limite e ${AUDIT_EXPORT_MAX_EVENTS}.`,
      });
    }

    const rows = await this.events.listAll(filter);
    let file: Buffer;

    try {
      file = this.csv.render(
        rows.map((row) => maskForeignPersonalData(row, ctx.organizationId)),
      );
    } catch (error) {
      throw new DomainException({
        ...AuditErrors.EXPORT_FAILED,
        detail: null,
        cause: error,
      });
    }

    const { from, to } = filter.period;

    // O termo da busca pode ser um nome: so registra que houve busca.
    await this.events.recordExport(ctx, {
      from,
      to,
      total: rows.length,
      filters: {
        action: filter.action ?? null,
        severity: filter.severity ?? null,
        actorUserId: filter.actorUserId ?? null,
        actorType: filter.actorType ?? null,
        organizationId: filter.organizationId,
        hasSearch: filter.search !== undefined,
      },
    });

    return new StreamableFile(file, {
      type: 'text/csv; charset=utf-8',
      length: file.length,
      disposition: `attachment; filename="auditoria-${from}-a-${to}.csv"`,
    });
  }
}
