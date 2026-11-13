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
  /** Lancado pelo guard (BE-32); o codigo e do dominio do termo de uso. */
  TERMS_ACCEPTANCE_REQUIRED: {
    code: 'TERMS_ACCEPTANCE_REQUIRED',
    status: HttpStatus.FORBIDDEN,
    message: 'Aceite o termo de uso para continuar.',
  },
  USER_NOT_FOUND: {
    code: 'AUTH_USER_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Usuário não encontrado.',
  },
  RESET_TOKEN_INVALID_OR_EXPIRED: {
    code: 'AUTH_RESET_TOKEN_INVALID_OR_EXPIRED',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Token de redefinição inválido ou expirado.',
  },
  INVITATION_INVALID_OR_EXPIRED: {
    code: 'AUTH_INVITATION_INVALID_OR_EXPIRED',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'Este convite não é mais válido. Peça um novo convite ao administrador da sua organização.',
  },
  CURRENT_PASSWORD_INVALID: {
    code: 'AUTH_CURRENT_PASSWORD_INVALID',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Senha atual inválida.',
  },
  PASSWORD_REUSE: {
    code: 'AUTH_PASSWORD_REUSE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'A nova senha não pode ser igual à atual.',
  },
  INVALID_STATE: {
    code: 'AUTH_INVALID_STATE',
    status: HttpStatus.CONFLICT,
    message: 'A operação não é permitida no estado atual.',
  },
  TEMPORARILY_BLOCKED: {
    code: 'AUTH_TEMPORARILY_BLOCKED',
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Muitas tentativas. Aguarde antes de tentar novamente.',
  },
  DEPENDENCY_UNAVAILABLE: {
    code: 'AUTH_DEPENDENCY_UNAVAILABLE',
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Serviço temporariamente indisponível.',
  },
} as const;
