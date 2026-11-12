import { HttpStatus } from '@nestjs/common';

export const ProfileErrors = {
  NOTHING_TO_UPDATE: {
    code: 'PROFILE_NOTHING_TO_UPDATE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Informe ao menos um campo para atualizar.',
  },
  CURRENT_PASSWORD_REQUIRED: {
    code: 'PROFILE_CURRENT_PASSWORD_REQUIRED',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Informe a senha atual para trocar o e-mail.',
  },
} as const;
