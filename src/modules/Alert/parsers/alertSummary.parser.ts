import type { AlertSummaryDto } from '../dtos/alertSummary.dto';
import type { OpenAlertCounts } from '../types/alert.types';

/** Contadores -> resposta, iguais para todos os perfis com `alerts:read`. */
export const toAlertSummaryResponse = (
  open: OpenAlertCounts,
): AlertSummaryDto => ({
  open: {
    total: open.total,
    critical: open.critical,
    warning: open.warning,
    info: open.info,
  },
});
