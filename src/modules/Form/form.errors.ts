import { HttpStatus } from '@nestjs/common';

export const FormErrors = {
  NOT_FOUND: {
    code: 'FORM_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Formulário não encontrado.',
  },
  EMPTY: {
    code: 'FORM_EMPTY',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'O formulário precisa de ao menos um campo habilitado para ser salvo ou publicado.',
  },
  INVALID_FIELDS: {
    code: 'FORM_INVALID_FIELDS',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Revise a configuração dos campos indicados.',
  },
  INVALID_PATIENTS: {
    code: 'FORM_INVALID_PATIENTS',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'A lista deve ter apenas pacientes ativos da organização.',
  },
  NOTHING_TO_UPDATE: {
    code: 'FORM_NOTHING_TO_UPDATE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Informe ao menos um campo para atualizar.',
  },
  INACTIVE: {
    code: 'FORM_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O formulário está desativado. Reative-o antes de alterá-lo.',
  },
  NO_DRAFT: {
    code: 'FORM_NO_DRAFT',
    status: HttpStatus.CONFLICT,
    message: 'Não há alterações em rascunho neste formulário.',
  },
  NOT_PUBLISHED: {
    code: 'FORM_NOT_PUBLISHED',
    status: HttpStatus.CONFLICT,
    message:
      'O formulário ainda não foi publicado: o rascunho é o único conteúdo dele. Para descartá-lo, desative o formulário.',
  },
  IMPACT_CONFIRMATION_REQUIRED: {
    code: 'FORM_IMPACT_CONFIRMATION_REQUIRED',
    status: HttpStatus.CONFLICT,
    message:
      'Publicar cria uma nova versão: os registros novos passam a usá-la e os anteriores continuam ligados à versão que responderam. Confirme para publicar.',
  },
  ALREADY_INACTIVE: {
    code: 'FORM_ALREADY_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O formulário já está desativado.',
  },
  ALREADY_ACTIVE: {
    code: 'FORM_ALREADY_ACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O formulário não está desativado.',
  },
} as const;
