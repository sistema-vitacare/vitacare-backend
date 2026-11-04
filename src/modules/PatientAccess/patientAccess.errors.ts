import { HttpStatus } from '@nestjs/common';

export const PatientAccessErrors = {
  NOT_FOUND: {
    code: 'PATIENT_LINK_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Vínculo não encontrado.',
  },
  INVALID_USER: {
    code: 'PATIENT_LINK_INVALID_USER',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      'O usuário deve ser um cuidador ou familiar não inativo da organização.',
  },
  ALREADY_EXISTS: {
    code: 'PATIENT_LINK_ALREADY_EXISTS',
    status: HttpStatus.CONFLICT,
    message:
      'Este usuário já tem um vínculo vigente com o paciente. Edite-o ou revogue-o antes de criar outro.',
  },
  RESPONSIBLE_READ_ONLY: {
    code: 'PATIENT_LINK_RESPONSIBLE_READ_ONLY',
    status: HttpStatus.CONFLICT,
    message:
      'O vínculo de profissional responsável é alterado na edição do paciente.',
  },
  REVOKED: {
    code: 'PATIENT_LINK_REVOKED',
    status: HttpStatus.CONFLICT,
    message: 'O vínculo já foi revogado. Para devolver o acesso, crie outro.',
  },
  NOTHING_TO_UPDATE: {
    code: 'PATIENT_LINK_NOTHING_TO_UPDATE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Informe ao menos um campo para atualizar.',
  },
} as const;
