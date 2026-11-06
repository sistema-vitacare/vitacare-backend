import type { RequestContext } from '@/common/context/requestContext.type';
import type { FieldType } from '@/modules/Form/types/form.types';

import type { FollowUpAnswerDto, FollowUpDto } from '../dtos/followUp.dto';
import type { FollowUpDetail } from '../types/followUp.types';

/** Desfaz o texto canonico de `parseFieldAnswer` no tipo do campo. */
export const toAnswerValue = (
  fieldType: FieldType,
  text: string,
): FollowUpAnswerDto['value'] => {
  switch (fieldType) {
    case 'number':
    case 'scale':
      return Number(text);
    case 'boolean':
      return text === 'true';
    case 'multiple_choice':
      return JSON.parse(text) as string[];
    case 'text':
    case 'single_choice':
      return text;
  }
};

/**
 * Registro -> resposta, igual para todos os perfis: o familiar le o registro
 * valido completo e nao alcanca o anulado (BE-19).
 */
export const toFollowUpResponse = (
  detail: FollowUpDetail,
  _ctx: RequestContext,
): FollowUpDto => ({
  id: detail.id,
  patientId: detail.patientId,
  form: {
    id: detail.formId,
    name: detail.formName,
    versionId: detail.formVersionId,
    versionNumber: detail.formVersionNumber,
  },
  author: detail.author,
  visitedAt: detail.visitedAt.toISOString(),
  submittedAt: detail.submittedAt.toISOString(),
  notes: detail.notes,
  status: detail.status,
  annulment:
    detail.status === 'annulled'
      ? {
          annulledAt: detail.annulledAt!.toISOString(),
          annulledBy: detail.annulledBy!,
          reason: detail.annulmentReason!,
        }
      : null,
  answers: detail.answers.map((answer) => ({
    fieldId: answer.fieldId,
    fieldKey: answer.fieldKey,
    name: answer.name,
    fieldType: answer.fieldType,
    unit: answer.unit,
    section: answer.section,
    position: answer.position,
    value: toAnswerValue(answer.fieldType, answer.value),
  })),
});
