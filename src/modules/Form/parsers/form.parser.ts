import type { RequestContext } from '@/common/context/requestContext.type';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { CreateFormDto } from '../CreateForm/createForm.dto';
import type { FormDto, FormFieldDto, FormSummaryDto } from '../dtos/form.dto';
import type { FormFieldInputDto } from '../dtos/formFieldInput.dto';
import type { UpdateFormDto } from '../UpdateForm/updateForm.dto';
import type {
  FormFieldConfig,
  FormFieldRow,
  FormPatch,
  FormProperties,
  FormSummaryRow,
  FormDetail,
} from '../types/form.types';

/** Quem le sem configurar (cuidador) nao ve rascunho. */
const configures = (ctx: RequestContext): boolean =>
  patientScope(ctx).viewerUserId === null;

export const toFieldConfig = (input: FormFieldInputDto): FormFieldConfig => ({
  ...(input.fieldKey !== undefined && { fieldKey: input.fieldKey }),
  name: input.name,
  fieldType: input.fieldType,
  requirement: input.requirement,
  section: input.section ?? null,
  unit: input.unit ?? null,
  decimalPlaces: input.decimalPlaces ?? null,
  scaleMin: input.scaleMin ?? null,
  scaleMax: input.scaleMax ?? null,
  options: input.options ?? null,
});

/** `requirement` -> `obrigatorio`/`ativo` do MER. */
export const toFieldColumns = (field: FormFieldConfig) => ({
  required: field.requirement === 'required',
  active: field.requirement !== 'disabled',
});

export const toFormProperties = (input: CreateFormDto): FormProperties => ({
  name: input.name,
  description: input.description ?? null,
  trackingType: input.trackingType ?? null,
  frequency: input.frequency
    ? { interval: input.frequency.interval, unit: input.frequency.unit }
    : null,
});

/** Corpo de edicao -> so o que veio; `null` limpa. */
export const toFormPatch = (input: UpdateFormDto): FormPatch => ({
  ...(input.name !== undefined && { name: input.name }),
  ...(input.description !== undefined && { description: input.description }),
  ...(input.trackingType !== undefined && {
    trackingType: input.trackingType,
  }),
  ...(input.frequency !== undefined && {
    frequency: input.frequency
      ? { interval: input.frequency.interval, unit: input.frequency.unit }
      : null,
  }),
});

const toFieldResponse = (field: FormFieldRow): FormFieldDto => ({
  id: field.id,
  fieldKey: field.fieldKey,
  name: field.name,
  fieldType: field.fieldType,
  requirement: field.requirement,
  position: field.position,
  section: field.section,
  unit: field.unit,
  decimalPlaces: field.decimalPlaces,
  scaleMin: field.scaleMin,
  scaleMax: field.scaleMax,
  options: field.options,
});

const toBase = (row: FormSummaryRow, ctx: RequestContext) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  trackingType: row.trackingType,
  status: row.status,
  audience: row.audience,
  patientIds: row.patientIds,
  frequency:
    row.frequencyInterval !== null && row.frequencyUnit !== null
      ? { interval: row.frequencyInterval, unit: row.frequencyUnit }
      : null,
  hasDraft: configures(ctx) && row.hasDraft,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deactivatedAt: row.deletedAt?.toISOString() ?? null,
});

const toVersionSummary = (row: FormSummaryRow) =>
  row.currentVersionId !== null &&
  row.currentVersionNumber !== null &&
  row.currentPublishedAt !== null
    ? {
        id: row.currentVersionId,
        number: row.currentVersionNumber,
        publishedAt: row.currentPublishedAt.toISOString(),
        fieldCount: row.currentFieldCount,
      }
    : null;

export const toFormSummaryResponse = (
  row: FormSummaryRow,
  ctx: RequestContext,
): FormSummaryDto => ({
  ...toBase(row, ctx),
  currentVersion: toVersionSummary(row),
});

export const toFormResponse = (
  detail: FormDetail,
  ctx: RequestContext,
): FormDto => {
  const version = toVersionSummary(detail);

  return {
    ...toBase(detail, ctx),
    currentVersion: version && {
      ...version,
      fields: detail.currentFields.map(toFieldResponse),
    },
    ...(configures(ctx) && {
      draft: detail.draft && {
        id: detail.draft.id,
        updatedAt: detail.draft.updatedAt.toISOString(),
        fields: detail.draft.fields.map(toFieldResponse),
      },
    }),
  };
};
