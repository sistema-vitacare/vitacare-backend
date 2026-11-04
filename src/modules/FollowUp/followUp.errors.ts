import { HttpStatus } from '@nestjs/common';

export const FollowUpErrors = {
  NOT_FOUND: {
    code: 'FOLLOW_UP_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Registro de acompanhamento não encontrado.',
  },
  PATIENT_INACTIVE: {
    code: 'FOLLOW_UP_PATIENT_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O paciente está inativo e não recebe novos registros.',
  },
  FORM_NOT_APPLICABLE: {
    code: 'FOLLOW_UP_FORM_NOT_APPLICABLE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Este formulário não vale para o paciente escolhido.',
  },
  FORM_VERSION_OUTDATED: {
    code: 'FOLLOW_UP_FORM_VERSION_OUTDATED',
    status: HttpStatus.CONFLICT,
    message:
      'O formulário foi atualizado enquanto você preenchia. Recarregue-o e envie de novo.',
  },
  EMPTY: {
    code: 'FOLLOW_UP_EMPTY',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Preencha ao menos um campo do formulário antes de enviar.',
  },
  INVALID_ANSWERS: {
    code: 'FOLLOW_UP_INVALID_ANSWERS',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Revise as respostas indicadas.',
  },
  INVALID_VISITED_AT: {
    code: 'FOLLOW_UP_INVALID_VISITED_AT',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'A data e hora da visita não podem estar no futuro.',
  },
  NOT_AUTHOR: {
    code: 'FOLLOW_UP_NOT_AUTHOR',
    status: HttpStatus.FORBIDDEN,
    message: 'Só quem fez o registro pode anulá-lo.',
  },
  ALREADY_ANNULLED: {
    code: 'FOLLOW_UP_ALREADY_ANNULLED',
    status: HttpStatus.CONFLICT,
    message: 'Este registro já foi anulado.',
  },
} as const;
