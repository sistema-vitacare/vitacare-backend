import { HttpStatus } from '@nestjs/common';

export const PatientErrors = {
  NOT_FOUND: {
    code: 'PATIENT_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Paciente não encontrado.',
  },
  DUPLICATE_CPF: {
    code: 'PATIENT_DUPLICATE_CPF',
    status: HttpStatus.CONFLICT,
    message:
      'Já existe um paciente com este CPF na organização. Busque o paciente na listagem; se ele estiver inativo, reative-o.',
  },
  INVALID_RESPONSIBLE: {
    code: 'PATIENT_INVALID_RESPONSIBLE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'O responsável deve ser um profissional de saúde ou administrador não inativo da organização.',
  },
  PLAN_LIMIT_REACHED: {
    code: 'PATIENT_PLAN_LIMIT_REACHED',
    status: HttpStatus.CONFLICT,
    message:
      'O limite de pacientes ativos do plano foi atingido. Inative um paciente ou solicite a mudança de plano.',
  },
  PLAN_EXPIRED: {
    code: 'PATIENT_PLAN_EXPIRED',
    status: HttpStatus.CONFLICT,
    message:
      'A vigência do plano da organização venceu. Novos cadastros ficam bloqueados até a renovação.',
  },
  NOTHING_TO_UPDATE: {
    code: 'PATIENT_NOTHING_TO_UPDATE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Informe ao menos um campo para atualizar.',
  },
  INACTIVE: {
    code: 'PATIENT_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O paciente está inativo. Reative-o antes de editar.',
  },
  ALREADY_INACTIVE: {
    code: 'PATIENT_ALREADY_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O paciente já está inativo.',
  },
  ALREADY_ACTIVE: {
    code: 'PATIENT_ALREADY_ACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O paciente não está inativo.',
  },
} as const;
