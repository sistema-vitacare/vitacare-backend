import { HttpStatus } from '@nestjs/common';

export const ReportErrors = {
  TOO_MANY_RECORDS: {
    code: 'REPORT_TOO_MANY_RECORDS',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'O período tem registros demais para um relatório. Escolha um período menor.',
  },
  EXPORT_FAILED: {
    code: 'REPORT_EXPORT_FAILED',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Não foi possível gerar o PDF do relatório. Tente novamente.',
  },
} as const;
