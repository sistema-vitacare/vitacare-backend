import { PickType } from '@nestjs/swagger';

import { ListAlertsQueryDto } from '../ListAlerts/listAlerts.dto';

/**
 * Filtros dos contadores (BE-33): os de `GET /alerts`, menos severidade e
 * status, que sao o que se conta, e menos paginacao e ordem.
 */
export class AlertSummaryQueryDto extends PickType(ListAlertsQueryDto, [
  'patientId',
  'source',
] as const) {}
