import type { FieldError } from '@/common/errors/domainError.type';
import { parseFieldAnswer } from '@/modules/Form/parsers/fieldAnswer.parser';

import type {
  AnswerInput,
  AnswerItem,
  VersionField,
} from '../types/followUp.types';

export type AnswersCheck =
  | { kind: 'empty' }
  | { kind: 'invalid'; errors: FieldError[] }
  | { kind: 'valid'; items: AnswerItem[] };

/**
 * Valida as respostas contra os campos da versao respondida (UC11). Tipo e
 * obrigatoriedade sao as unicas regras: valor fora de faixa clinica e dado a
 * gravar. Sem nenhum valor preenchido o envio e vazio (`0` e `false` contam
 * como preenchidos). Obrigatorio ausente aponta `answers.<fieldId>`, porque nao
 * ha posicao na lista enviada.
 */
export const checkAnswers = (
  fields: readonly VersionField[],
  answers: readonly AnswerInput[],
): AnswersCheck => {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const seen = new Set<string>();
  const errors: FieldError[] = [];
  const items: AnswerItem[] = [];
  const provided = new Set<string>();

  answers.forEach((answer, index) => {
    const field = byId.get(answer.fieldId);

    if (!field) {
      errors.push({ field: `answers.${index}.fieldId`, code: 'UNKNOWN' });
      return;
    }
    if (seen.has(answer.fieldId)) {
      errors.push({ field: `answers.${index}.fieldId`, code: 'DUPLICATE' });
      return;
    }

    seen.add(answer.fieldId);

    const parsed = parseFieldAnswer(field, answer.value);

    if (parsed.kind !== 'empty') provided.add(field.id);
    if (parsed.kind === 'invalid') {
      errors.push({ field: `answers.${index}.value`, code: parsed.code });
    } else if (parsed.kind === 'value') {
      items.push({ fieldId: field.id, value: parsed.text });
    }
  });

  if (errors.length === 0 && items.length === 0) return { kind: 'empty' };

  for (const field of fields) {
    if (field.requirement === 'required' && !provided.has(field.id)) {
      errors.push({
        field: `answers.${field.id}`,
        code: 'REQUIRED',
        message: `${field.name} é obrigatório.`,
      });
    }
  }

  return errors.length > 0
    ? { kind: 'invalid', errors }
    : { kind: 'valid', items };
};
