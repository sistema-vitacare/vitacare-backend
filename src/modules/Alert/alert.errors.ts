import { HttpStatus } from '@nestjs/common';

export const AlertErrors = {
  RULE_NOT_FOUND: {
    code: 'ALERT_RULE_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Regra de alerta não encontrada.',
  },
  RULE_FORM_INACTIVE: {
    code: 'ALERT_RULE_FORM_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O formulário está desativado. Reative-o antes de criar regras.',
  },
  RULE_FIELD_NOT_FOUND: {
    code: 'ALERT_RULE_FIELD_NOT_FOUND',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'O campo informado não existe na versão vigente do formulário.',
  },
  RULE_FIELD_NOT_NUMERIC: {
    code: 'ALERT_RULE_FIELD_NOT_NUMERIC',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Regras de alerta só valem para campos numéricos ou de escala.',
  },
  RULE_PATIENT_INACTIVE: {
    code: 'ALERT_RULE_PATIENT_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O paciente está inativo. Reative-o antes de criar regras.',
  },
  RULE_FORM_NOT_APPLICABLE: {
    code: 'ALERT_RULE_FORM_NOT_APPLICABLE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'O formulário não se aplica a este paciente.',
  },
  RULE_INACTIVE: {
    code: 'ALERT_RULE_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'A regra está inativa. Reative-a antes de editar.',
  },
  RULE_ALREADY_INACTIVE: {
    code: 'ALERT_RULE_ALREADY_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'A regra já está inativa.',
  },
  RULE_ALREADY_ACTIVE: {
    code: 'ALERT_RULE_ALREADY_ACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'A regra não está inativa.',
  },
  RULE_NOTHING_TO_UPDATE: {
    code: 'ALERT_RULE_NOTHING_TO_UPDATE',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Nenhuma alteração informada.',
  },
  NOT_FOUND: {
    code: 'ALERT_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Alerta não encontrado.',
  },
  ALREADY_RESOLVED: {
    code: 'ALERT_ALREADY_RESOLVED',
    status: HttpStatus.CONFLICT,
    message: 'O alerta já foi resolvido.',
  },
} as const;
