import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, withMeta } from '@/common/http/envelope';

import { DashboardErrors } from '../dashboard.errors';
import type { DashboardRepository } from '../repositories/dashboard.repository';

/** Recurso `operational_dashboard` do plano (Quadro 2), antes de qualquer contagem. */
export const assertDashboardAvailable = async (
  dashboard: DashboardRepository,
  organizationId: string,
): Promise<void> => {
  if (await dashboard.hasDashboard(organizationId)) return;

  throw new DomainException({
    ...DashboardErrors.PLAN_FEATURE_UNAVAILABLE,
    detail: 'O plano corrente da organizacao nao inclui operational_dashboard.',
  });
};

/** Periodo sem dados: zeros e mensagem informativa (UC05, fluxo alternativo). */
export const withEmptyNotice = <T>(
  data: T,
  empty: boolean,
  message: string,
): EnvelopePayload<T> => withMeta(data, empty ? { message } : {});
