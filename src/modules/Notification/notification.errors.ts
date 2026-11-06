import { HttpStatus } from '@nestjs/common';

export const NotificationErrors = {
  NOT_FOUND: {
    code: 'NOTIFICATION_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Notificação não encontrada.',
  },
  ORGANIZATION_ALERTS_ADMIN_ONLY: {
    code: 'NOTIFICATION_ORGANIZATION_ALERTS_ADMIN_ONLY',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'Só administradores podem receber os alertas de toda a organização.',
  },
  PUSH_DISABLED: {
    code: 'NOTIFICATION_PUSH_DISABLED',
    status: HttpStatus.CONFLICT,
    message: 'As notificações push não estão habilitadas neste servidor.',
  },
  PUSH_ENDPOINT_NOT_ALLOWED: {
    code: 'NOTIFICATION_PUSH_ENDPOINT_NOT_ALLOWED',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'O endereço de push não pertence a um serviço de push reconhecido.',
  },
  PUSH_SUBSCRIPTION_NOT_FOUND: {
    code: 'NOTIFICATION_PUSH_SUBSCRIPTION_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Inscrição de push não encontrada.',
  },
} as const;
