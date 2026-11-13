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
  DUPLICATE_EMAIL: {
    code: 'USER_DUPLICATE_EMAIL',
    status: HttpStatus.CONFLICT,
    message:
      'Já existe um usuário com este e-mail na organização. Se ele estiver inativo, reative-o.',
  },
  DUPLICATE_CPF: {
    code: 'USER_DUPLICATE_CPF',
    status: HttpStatus.CONFLICT,
    message:
      'Já existe um usuário com este CPF na organização. Se ele estiver inativo, reative-o.',
  },
  PLAN_LIMIT_REACHED: {
    code: 'USER_PLAN_LIMIT_REACHED',
    status: HttpStatus.CONFLICT,
    message:
      'O limite de usuários do plano foi atingido. Inative um usuário ou solicite a mudança de plano.',
  },
  PLAN_EXPIRED: {
    code: 'USER_PLAN_EXPIRED',
    status: HttpStatus.CONFLICT,
    message:
      'A vigência do plano da organização venceu. Novos cadastros ficam bloqueados até a renovação.',
  },
  NOTHING_TO_UPDATE: {
    code: 'USER_NOTHING_TO_UPDATE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Informe ao menos um campo para atualizar.',
  },
  SELF_STATUS_CHANGE: {
    code: 'USER_SELF_STATUS_CHANGE',
    status: HttpStatus.CONFLICT,
    message: 'Você não pode inativar ou reativar a sua própria conta.',
  },
  ALREADY_INACTIVE: {
    code: 'USER_ALREADY_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O usuário já está inativo.',
  },
  ALREADY_ACTIVE: {
    code: 'USER_ALREADY_ACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O usuário não está inativo.',
  },
  INVITATION_ALREADY_ACCEPTED: {
    code: 'USER_INVITATION_ALREADY_ACCEPTED',
    status: HttpStatus.CONFLICT,
    message:
      'O usuário já está ativo. Para uma nova senha, use a redefinição de senha.',
  },
  INVITATION_EMAIL_UNAVAILABLE: {
    code: 'USER_INVITATION_EMAIL_UNAVAILABLE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'O envio de convite por e-mail não está disponível. Use a senha provisória.',
  },
  INACTIVE: {
    code: 'USER_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O usuário está inativo. Reative-o antes de reenviar o convite.',
  },
} as const;
