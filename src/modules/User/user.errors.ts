import { HttpStatus } from '@nestjs/common';

export const UserErrors = {
  NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Usuário não encontrado.',
  },
  SELF_PROFILE_CHANGE: {
    code: 'USER_SELF_PROFILE_CHANGE',
    status: HttpStatus.CONFLICT,
    message: 'Você não pode alterar o seu próprio perfil.',
  },
} as const;
