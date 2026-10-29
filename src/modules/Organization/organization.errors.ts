import { HttpStatus } from '@nestjs/common';

export const OrganizationErrors = {
  NOT_FOUND: {
    code: 'ORGANIZATION_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Organização não encontrada.',
  },
  CODE_TAKEN: {
    code: 'ORGANIZATION_CODE_TAKEN',
    status: HttpStatus.CONFLICT,
    message: 'Já existe uma organização com este código.',
  },
  DOCUMENT_TAKEN: {
    code: 'ORGANIZATION_DOCUMENT_TAKEN',
    status: HttpStatus.CONFLICT,
    message: 'Já existe uma organização com este documento.',
  },
  PLAN_NOT_FOUND: {
    code: 'ORGANIZATION_PLAN_NOT_FOUND',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Plano de uso inexistente ou indisponível.',
  },
  NOTHING_TO_UPDATE: {
    code: 'ORGANIZATION_NOTHING_TO_UPDATE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Informe ao menos um campo para atualizar.',
  },
  ALREADY_INACTIVE: {
    code: 'ORGANIZATION_ALREADY_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'A organização já está inativa.',
  },
  ALREADY_ACTIVE: {
    code: 'ORGANIZATION_ALREADY_ACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'A organização já está ativa.',
  },
  PLATFORM_PROTECTED: {
    code: 'ORGANIZATION_PLATFORM_PROTECTED',
    status: HttpStatus.CONFLICT,
    message: 'A organização da plataforma não pode ser inativada.',
  },
  PLATFORM_ALREADY_EXISTS: {
    code: 'ORGANIZATION_PLATFORM_ALREADY_EXISTS',
    status: HttpStatus.CONFLICT,
    message: 'A organização da plataforma já foi criada.',
  },
  SEED_INVALID_INPUT: {
    code: 'ORGANIZATION_SEED_INVALID_INPUT',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Dados do seed da plataforma inválidos.',
  },
} as const;
