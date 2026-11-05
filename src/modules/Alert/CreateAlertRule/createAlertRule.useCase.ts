import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { FormErrors } from '@/modules/Form/form.errors';
import { PatientErrors } from '@/modules/Patient/patient.errors';

import { AlertErrors } from '../alert.errors';
import type { AlertRuleDto } from '../dtos/alertRule.dto';
import { toAlertRuleResponse } from '../parsers/alertRule.parser';
import { AlertRuleRepository } from '../repositories/alertRule.repository';
import type { CreateAlertRuleOutcome } from '../types/alert.types';
import type { CreateAlertRuleDto } from './createAlertRule.dto';

const FAILURES: Record<
  Exclude<CreateAlertRuleOutcome['kind'], 'created'>,
  () => DomainException
> = {
  form_not_found: () =>
    new DomainException({
      ...FormErrors.NOT_FOUND,
      detail: 'Formulario inexistente na organizacao ou nunca publicado.',
    }),
  form_inactive: () =>
    new DomainException({
      ...AlertErrors.RULE_FORM_INACTIVE,
      detail: 'Formulario desativado nao recebe regra nova.',
    }),
  field_not_found: () =>
    new DomainException({
      ...AlertErrors.RULE_FIELD_NOT_FOUND,
      detail: 'fieldKey ausente na versao publicada vigente.',
      fields: [{ field: 'fieldKey', code: 'NOT_FOUND' }],
    }),
  field_not_numeric: () =>
    new DomainException({
      ...AlertErrors.RULE_FIELD_NOT_NUMERIC,
      detail: 'Campo de tipo diferente de number e scale.',
      fields: [{ field: 'fieldKey', code: 'NOT_NUMERIC' }],
    }),
  patient_not_found: () =>
    new DomainException({
      ...PatientErrors.NOT_FOUND,
      detail: 'Paciente inexistente na organizacao.',
    }),
  patient_inactive: () =>
    new DomainException({
      ...AlertErrors.RULE_PATIENT_INACTIVE,
      detail: 'Paciente inativo nao recebe regra nova.',
    }),
  form_not_applicable: () =>
    new DomainException({
      ...AlertErrors.RULE_FORM_NOT_APPLICABLE,
      detail: 'O formulario vale para uma lista de pacientes sem este.',
      fields: [{ field: 'patientId', code: 'NOT_APPLICABLE' }],
    }),
};

/**
 * UC09 passo 5 / RF013: regra sobre um campo numerico da versao vigente,
 * geral ou de um paciente. O limiar e do profissional; o sistema nao sugere
 * valor clinico.
 */
@Injectable()
export class CreateAlertRuleUseCase {
  constructor(private readonly rules: AlertRuleRepository) {}

  async execute(
    dto: CreateAlertRuleDto,
    ctx: RequestContext,
  ): Promise<AlertRuleDto> {
    const outcome = await this.rules.create({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      formId: dto.formId,
      fieldKey: dto.fieldKey,
      patientId: dto.patientId ?? null,
      name: dto.name,
      description: dto.description ?? null,
      operator: dto.operator,
      referenceValue: dto.referenceValue,
      severity: dto.severity,
    });

    if (outcome.kind !== 'created') throw FAILURES[outcome.kind]();

    return toAlertRuleResponse(outcome.rule, ctx);
  }
}
