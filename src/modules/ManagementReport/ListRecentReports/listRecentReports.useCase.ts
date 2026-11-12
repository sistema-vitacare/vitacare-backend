import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import type { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import {
  type EnvelopePayload,
  paginate,
  withMeta,
} from '@/common/http/envelope';

import { toRecentReport } from '../parsers/managementReport.parser';
import { assertManagementReportsAvailable } from '../policies/managementReport.policy';
import { ManagementReportRepository } from '../repositories/managementReport.repository';
import { RECENT_REPORTS_EMPTY_MESSAGE } from '../types/managementReport.types';
import type { RecentReportDto } from './listRecentReports.dto';

/**
 * "Relatorios recentes" da Figura 43, montados pelas exportacoes auditadas
 * (decisao de Mateus, 2026-11-12). Nada fica guardado para baixar de novo.
 */
@Injectable()
export class ListRecentReportsUseCase {
  constructor(private readonly reports: ManagementReportRepository) {}

  async execute(
    query: Pick<PaginationQueryDto, 'page' | 'limit'>,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<RecentReportDto[]>> {
    await assertManagementReportsAvailable(this.reports, ctx.organizationId);

    const { rows, total } = await this.reports.recentExports(
      ctx.organizationId,
      query.page,
      query.limit,
    );
    const page = paginate(rows.map(toRecentReport), total, query);

    return total === 0
      ? withMeta(page.data, {
          ...page.extras,
          message: RECENT_REPORTS_EMPTY_MESSAGE,
        })
      : page;
  }
}
