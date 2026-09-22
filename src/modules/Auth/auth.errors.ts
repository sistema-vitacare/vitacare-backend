import { HttpStatus } from '@nestjs/common';

export const AuthErrors = {
  INVALID_CREDENTIALS: {
    code: 'AUTH_INVALID_CREDENTIALS',
    status: HttpStatus.UNAUTHORIZED,
    message: 'Credenciais inválidas.',
  },
  UNAUTHENTICATED: {
    code: 'AUTH_UNAUTHENTICATED',
    status: HttpStatus.UNAUTHORIZED,
    message: 'Autenticação necessária.',
  },
  FORBIDDEN: {
    code: 'AUTH_FORBIDDEN',
    status: HttpStatus.FORBIDDEN,
    message: 'Você não tem permissão para esta operação.',
  },
  DEPENDENCY_UNAVAILABLE: {
    code: 'AUTH_DEPENDENCY_UNAVAILABLE',
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Serviço temporariamente indisponível.',
  },
} as const;
