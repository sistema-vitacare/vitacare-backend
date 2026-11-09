import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { translatePgError } from '@/common/errors/pgError.translator';
import { findPatientInScope } from '@/modules/PatientAccess/repositories/patientAccess.query';

import type {
  EvolutionFilter,
  EvolutionPointRow,
  EvolutionScope,
} from '../types/evolution.types';

/**
 * Medicoes `number`/`scale` de registros validos de um paciente do alcance,
 * com a configuracao da versao respondida, em ordem cronologica.
 */
@Injectable()
export class PatientEvolutionRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** `null` quando o paciente esta fora do alcance de quem le. */
  async findPoints(
    scope: EvolutionScope,
    patientId: string,
    filter: EvolutionFilter,
  ): Promise<EvolutionPointRow[] | null> {
    try {
      const manager = this.dataSource.manager;

      if (!(await findPatientInScope(manager, scope, patientId))) return null;

      return await manager.query<EvolutionPointRow[]>(
        `SELECT ff.field_key AS "fieldKey",
                ff.name,
                ff.field_type AS "fieldType",
                ff.unit,
                ff.scale_min AS "scaleMin",
                ff.scale_max AS "scaleMax",
                ff.section,
                ff.position,
                f.id AS "formId",
                f.name AS "formName",
                i.value,
                r.visited_at AS "visitedAt",
                r.id AS "followUpId"
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
            AND r.visited_at >= $3::date::timestamp AT TIME ZONE 'America/Sao_Paulo'
            AND r.visited_at < ($4::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
            AND ($5::uuid IS NULL OR f.id = $5)
            AND ($6::uuid IS NULL OR ff.field_key = $6)
          ORDER BY r.visited_at, r.created_at, r.id, ff.position`,
        [
          scope.organizationId,
          patientId,
          filter.from,
          filter.to,
          filter.formId ?? null,
          filter.fieldKey ?? null,
        ],
      );
    } catch (error) {
      throw translatePgError(error, 'patient_evolution');
    }
  }
}
