import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { FormErrors } from '@/modules/Form/form.errors';
import { PatientErrors } from '@/modules/Patient/patient.errors';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FollowUpDto } from '../dtos/followUp.dto';
import { FollowUpErrors } from '../followUp.errors';
import { toFollowUpResponse } from '../parsers/followUp.parser';
import { FollowUpRepository } from '../repositories/followUp.repository';
import type { CreateFollowUpOutcome } from '../types/followUp.types';
import type { CreateFollowUpDto } from './createFollowUp.dto';

/** Folga para relogio de celular adiantado em relacao ao servidor. */
export const VISITED_AT_CLOCK_SKEW_MS = 5 * 60 * 1000;

const FAILURES: Record<
  Exclude<CreateFollowUpOutcome['kind'], 'created' | 'invalid_answers'>,
  () => DomainException
> = {
  patient_not_found: () =>
    new DomainException({
      ...PatientErrors.NOT_FOUND,
      detail: 'Paciente inexistente ou sem vinculo de cuidador vigente.',
    }),
  patient_inactive: () =>
    new DomainException({
      ...FollowUpErrors.PATIENT_INACTIVE,
      detail: 'Paciente inativo nao recebe registro de acompanhamento.',
    }),
  form_not_found: () =>
    new DomainException({
      ...FormErrors.NOT_FOUND,
      detail: 'Formulario inexistente na organizacao ou nunca publicado.',
    }),
  form_inactive: () =>
    new DomainException({
      ...FormErrors.INACTIVE,
      message: 'O formulário foi desativado e não recebe novos registros.',
      detail: 'Formulario desativado nao aceita registro.',
    }),
  form_not_applicable: () =>
    new DomainException({
      ...FollowUpErrors.FORM_NOT_APPLICABLE,
      detail: 'O formulario vale para uma lista de pacientes sem este.',
      fields: [{ field: 'formId', code: 'NOT_APPLICABLE' }],
    }),
  version_outdated: () =>
    new DomainException({
      ...FollowUpErrors.FORM_VERSION_OUTDATED,
      detail: 'formVersionId nao e a versao publicada vigente.',
      fields: [{ field: 'formVersionId', code: 'OUTDATED' }],
    }),
  empty: () =>
    new DomainException({
      ...FollowUpErrors.EMPTY,
      detail: 'Nenhuma resposta com valor preenchido.',
      fields: [{ field: 'answers', code: 'EMPTY' }],
    }),
};

/**
 * UC11: o cuidador vinculado envia o formulario vigente do paciente. A autoria
 * e a organizacao vem da sessao; nada e gravado se qualquer regra falhar.
 */
@Injectable()
export class CreateFollowUpUseCase {
  constructor(private readonly followUps: FollowUpRepository) {}

  async execute(
    dto: CreateFollowUpDto,
    ctx: RequestContext,
  ): Promise<FollowUpDto> {
    const now = Date.now();
    const visitedAt = dto.visitedAt ? new Date(dto.visitedAt) : new Date(now);

    if (visitedAt.getTime() > now + VISITED_AT_CLOCK_SKEW_MS) {
      throw new DomainException({
        ...FollowUpErrors.INVALID_VISITED_AT,
        detail: 'visitedAt posterior ao momento do envio.',
        fields: [{ field: 'visitedAt', code: 'IN_FUTURE' }],
      });
    }

    const outcome = await this.followUps.create({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      patientId: dto.patientId,
      formId: dto.formId,
      formVersionId: dto.formVersionId,
      visitedAt,
      notes: dto.notes ?? null,
      answers: dto.answers,
    });

    if (outcome.kind === 'created') {
      return toFollowUpResponse(outcome.followUp, ctx);
    }
    if (outcome.kind === 'invalid_answers') {
      throw new DomainException({
        ...FollowUpErrors.INVALID_ANSWERS,
        detail: 'Respostas incompativeis com os campos da versao.',
        fields: outcome.errors,
      });
    }

    throw FAILURES[outcome.kind]();
  }
}
