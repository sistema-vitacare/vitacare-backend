import { HttpStatus } from '@nestjs/common';

export const AuditErrors = {
  EVENT_NOT_FOUND: {
    code: 'AUDIT_EVENT_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Evento de auditoria não encontrado.',
  },
  EXPORT_TOO_MANY_EVENTS: {
    code: 'AUDIT_EXPORT_TOO_MANY_EVENTS',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'Há eventos demais para exportar de uma vez. Estreite o período ou os filtros.',
  },
  EXPORT_FAILED: {
    code: 'AUDIT_EXPORT_FAILED',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Não foi possível gerar o arquivo da auditoria. Tente novamente.',
  },
} as const;
