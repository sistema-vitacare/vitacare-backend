import { HttpStatus } from '@nestjs/common';

export const ManagementReportErrors = {
  PLAN_FEATURE_UNAVAILABLE: {
    code: 'MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE',
    status: HttpStatus.FORBIDDEN,
    message:
      'Os relatórios gerenciais fazem parte do plano Enterprise. Solicite a mudança de plano para acessá-los.',
  },
  TOO_MANY_ALERTS: {
    code: 'MANAGEMENT_REPORT_TOO_MANY_ALERTS',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'O período tem alertas demais para um relatório. Escolha um período menor ou filtre por condição.',
  },
  EXPORT_FAILED: {
    code: 'MANAGEMENT_REPORT_EXPORT_FAILED',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Não foi possível gerar o PDF do relatório. Tente novamente.',
  },
} as const;
