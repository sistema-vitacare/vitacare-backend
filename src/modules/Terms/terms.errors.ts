import { HttpStatus } from '@nestjs/common';

export const TermsErrors = {
  NOT_PUBLISHED: {
    code: 'TERMS_NOT_PUBLISHED',
    status: HttpStatus.NOT_FOUND,
    message: 'O termo de uso ainda não foi publicado.',
  },
  VERSION_NOT_FOUND: {
    code: 'TERMS_VERSION_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Versão do termo não encontrada.',
  },
  VERSION_NOT_CURRENT: {
    code: 'TERMS_VERSION_NOT_CURRENT',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'Esta versão do termo não é a vigente. Leia a versão atual e aceite de novo.',
  },
} as const;
