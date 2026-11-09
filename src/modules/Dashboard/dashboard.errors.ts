import { HttpStatus } from '@nestjs/common';

export const DashboardErrors = {
  PLAN_FEATURE_UNAVAILABLE: {
    code: 'DASHBOARD_PLAN_FEATURE_UNAVAILABLE',
    status: HttpStatus.FORBIDDEN,
    message:
      'O painel operacional faz parte do plano Enterprise. Solicite a mudança de plano para acessá-lo.',
  },
} as const;
