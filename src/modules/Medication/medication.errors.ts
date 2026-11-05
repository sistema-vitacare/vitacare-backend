import { HttpStatus } from '@nestjs/common';

export const MedicationErrors = {
  NOT_FOUND: {
    code: 'MEDICATION_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Medicamento não encontrado.',
  },
  PATIENT_INACTIVE: {
    code: 'MEDICATION_PATIENT_INACTIVE',
    status: HttpStatus.CONFLICT,
    message:
      'O paciente está inativo. Reative-o antes de cadastrar ou alterar medicamentos.',
  },
  INACTIVE: {
    code: 'MEDICATION_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O medicamento está inativo. Reative-o antes de editar.',
  },
  ALREADY_INACTIVE: {
    code: 'MEDICATION_ALREADY_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O medicamento já está inativo.',
  },
  ALREADY_ACTIVE: {
    code: 'MEDICATION_ALREADY_ACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O medicamento não está inativo.',
  },
  INVALID_PERIOD: {
    code: 'MEDICATION_INVALID_PERIOD',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'A data de fim não pode ser anterior à data de início.',
  },
  NOTHING_TO_UPDATE: {
    code: 'MEDICATION_NOTHING_TO_UPDATE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Nenhuma alteração informada.',
  },
} as const;
