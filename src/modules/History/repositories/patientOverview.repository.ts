import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { translatePgError } from '@/common/errors/pgError.translator';
import { findPatientInScope } from '@/modules/PatientAccess/repositories/patientAccess.query';
import type { PatientScope } from '@/modules/Patient/types/patient.types';

import type {
  MeasurementRow,
  RecordSummary,
} from '../GetPatientOverview/getPatientOverview.type';

/**
 * Leitura agregada dos registros de um paciente do alcance (UC12, Figura 36).
 * So registros validos contam: o anulado continua no historico, mas nao e
 * medicao nem visita.
 */
@Injectable()
export class PatientOverviewRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** `null` quando o paciente esta fora do alcance de quem le. */
  async findRecordSummary(
    scope: PatientScope,
    patientId: string,
    valuesPerField: number,
  ): Promise<RecordSummary | null> {
    try {
      const manager = this.dataSource.manager;

      if (!(await findPatientInScope(manager, scope, patientId))) return null;

      const parameters = [scope.organizationId, patientId];
      const [[totals], measurements] = await Promise.all([
        manager.query<
          Array<{ validFollowUps: number; lastVisitedAt: Date | null }>
        >(
          `SELECT count(*)::int AS "validFollowUps",
                  max(visited_at) AS "lastVisitedAt"
             FROM follow_up_records
            WHERE organization_id = $1
              AND patient_id = $2
              AND status = 'valid'`,
          parameters,
        ),
        manager.query<MeasurementRow[]>(
          `SELECT "fieldKey", name, "fieldType", unit, section, position,
                  "formId", "formName", value, "visitedAt", "followUpId"
             FROM (
               SELECT ff.field_key AS "fieldKey",
                      ff.name,
                      ff.field_type AS "fieldType",
                      ff.unit,
                      ff.section,
                      ff.position,
                      f.id AS "formId",
                      f.name AS "formName",
                      i.value,
                      r.visited_at AS "visitedAt",
                      r.id AS "followUpId",
                      row_number() OVER (
                        PARTITION BY ff.field_key
                        ORDER BY r.visited_at DESC, r.created_at DESC, r.id
                      ) AS rank
                 FROM follow_up_records r
                 JOIN follow_up_responses resp
                   ON resp.record_id = r.id
                  AND resp.organization_id = r.organization_id
                 JOIN follow_up_forms f
                   ON f.id = resp.form_id
                  AND f.organization_id = resp.organization_id
                 JOIN follow_up_response_items i
                   ON i.response_id = resp.id
                  AND i.organization_id = resp.organization_id
                 JOIN follow_up_form_fields ff
                   ON ff.id = i.field_id
                  AND ff.organization_id = i.organization_id
                WHERE r.organization_id = $1
                  AND r.patient_id = $2
                  AND r.status = 'valid'
                  AND ff.field_type IN ('number', 'scale')
             ) latest
            WHERE rank <= $3
            ORDER BY "fieldKey", rank`,
          [...parameters, valuesPerField],
        ),
      ]);

      return { ...totals, measurements };
    } catch (error) {
      throw translatePgError(error, 'patient_overview');
    }
  }
}
