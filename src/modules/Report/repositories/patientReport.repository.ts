import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { RequestContext } from '@/common/context/requestContext.type';
import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import type { EvolutionPeriod } from '@/modules/Indicator/types/evolution.types';

import type { ReportHeaderRow } from '../types/patientReport.types';

/** Cabecalho do relatorio e registro da exportacao na auditoria. */
@Injectable()
export class PatientReportRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findHeader(
    organizationId: string,
    userId: string,
  ): Promise<ReportHeaderRow> {
    try {
      const [header] = await this.dataSource.query<ReportHeaderRow[]>(
        `SELECT o.trade_name AS "organizationName", u.name AS "userName"
           FROM users u
           JOIN organizations o ON o.id = u.organization_id
          WHERE u.organization_id = $1
            AND u.id = $2`,
        [organizationId, userId],
      );

      return header;
    } catch (error) {
      throw translatePgError(error, 'patient_reports');
    }
  }

  /** Sem dado clinico: so o paciente e o periodo exportado. */
  async recordExport(
    ctx: RequestContext,
    patientId: string,
    period: EvolutionPeriod,
  ): Promise<void> {
    try {
      await insertAuditEvent(this.dataSource.manager, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'patient_report.exported',
        entityType: 'patient',
        entityId: patientId,
        afterValues: { from: period.from, to: period.to },
        requestId: ctx.requestId,
      });
    } catch (error) {
      throw translatePgError(error, 'patient_reports');
    }
  }
}
