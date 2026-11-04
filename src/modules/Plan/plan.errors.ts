import { HttpStatus } from '@nestjs/common';

export const PlanErrors = {
  NOT_FOUND: {
    code: 'PLAN_NOT_FOUND',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Plano de uso inexistente ou indisponível.',
  },
  END_IN_PAST: {
    code: 'PLAN_TERM_END_IN_PAST',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'A data de fim da vigência deve ser futura.',
  },
  LIMIT_NOT_EXPANDABLE: {
    code: 'PLAN_LIMIT_NOT_EXPANDABLE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'Este plano tem limites fixos. Só o plano Enterprise admite expansão conforme contratação.',
  },
  LIMIT_BELOW_CATALOG: {
    code: 'PLAN_LIMIT_BELOW_CATALOG',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'A expansão não pode ficar abaixo do limite do plano. Omita o campo para usar o limite do catálogo.',
  },
  SAME_PLAN: {
    code: 'PLAN_CHANGE_SAME_PLAN',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'O plano solicitado é o plano atual. Só é possível pedir o mesmo plano para renovar uma vigência vencida.',
  },
  REQUEST_ALREADY_PENDING: {
    code: 'PLAN_CHANGE_REQUEST_ALREADY_PENDING',
    status: HttpStatus.CONFLICT,
    message:
      'Já existe uma solicitação de mudança de plano em análise. Aguarde a decisão ou cancele-a.',
  },
  REQUEST_NOT_FOUND: {
    code: 'PLAN_CHANGE_REQUEST_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Solicitação de mudança de plano não encontrada.',
  },
  REQUEST_NOT_PENDING: {
    code: 'PLAN_CHANGE_REQUEST_NOT_PENDING',
    status: HttpStatus.CONFLICT,
    message: 'A solicitação já foi decidida ou cancelada.',
  },
} as const;
