import type { FieldError } from '@/common/errors/domainError.type';
import type { PatientScope } from '@/modules/Patient/types/patient.types';

export const FIELD_TYPES = [
  'number',
  'scale',
  'boolean',
  'text',
  'single_choice',
  'multiple_choice',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Obrigatorio, Opcional e Desabilitado da Figura 39. */
export const FIELD_REQUIREMENTS = ['required', 'optional', 'disabled'] as const;

export type FieldRequirement = (typeof FIELD_REQUIREMENTS)[number];

export const FORM_STATUSES = ['draft', 'active', 'inactive'] as const;

export type FormStatus = (typeof FORM_STATUSES)[number];

export const FORM_AUDIENCES = ['organization', 'patients'] as const;

export type FormAudience = (typeof FORM_AUDIENCES)[number];

export const FREQUENCY_UNITS = ['hours', 'days', 'weeks'] as const;

export type FrequencyUnit = (typeof FREQUENCY_UNITS)[number];

export type VersionStatus = 'draft' | 'published';

export interface FormFrequency {
  interval: number;
  unit: FrequencyUnit;
}

/** Configuracao de um campo como chega do cliente (ja aparada). */
export interface FormFieldConfig {
  fieldKey?: string;
  name: string;
  fieldType: FieldType;
  requirement: FieldRequirement;
  section: string | null;
  unit: string | null;
  decimalPlaces: number | null;
  scaleMin: number | null;
  scaleMax: number | null;
  options: string[] | null;
}

export interface FormFieldRow extends FormFieldConfig {
  id: string;
  fieldKey: string;
  position: number;
}

/** Formulario como sai das consultas, ja recortado ao alcance de quem le. */
export interface FormSummaryRow {
  id: string;
  name: string;
  description: string | null;
  trackingType: string | null;
  status: FormStatus;
  audience: FormAudience;
  patientIds: string[];
  frequencyInterval: number | null;
  frequencyUnit: FrequencyUnit | null;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  currentPublishedAt: Date | null;
  /** Campos nao desabilitados da versao vigente. */
  currentFieldCount: number;
  hasDraft: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface FormDraft {
  id: string;
  updatedAt: Date;
  fields: FormFieldRow[];
}

export interface FormDetail extends FormSummaryRow {
  currentFields: FormFieldRow[];
  /** Sempre `null` para quem so le. */
  draft: FormDraft | null;
}

/** Dados do formulario que mudam sem nova versao. */
export interface FormProperties {
  name: string;
  description: string | null;
  trackingType: string | null;
  frequency: FormFrequency | null;
}

export type FormPatch = Partial<FormProperties>;

/** Mesmo alcance de pacientes: `viewerUserId` nulo e quem configura. */
export type FormScope = PatientScope;

/** Organizacao, ator e requestId vem sempre da sessao, nunca do corpo. */
export interface FormActor extends FormScope {
  actorUserId: string;
  requestId: string;
}

export interface CreateFormCommand extends FormActor {
  properties: FormProperties;
  audience: FormAudience;
  patientIds: string[];
  fields: FormFieldConfig[];
}

export interface UpdateFormCommand extends FormActor {
  formId: string;
  patch: FormPatch;
  audience?: FormAudience;
  patientIds?: string[];
}

export interface TargetFormCommand extends FormActor {
  formId: string;
}

export interface ListFormsFilter {
  status?: FormStatus;
  search?: string;
  patientId?: string;
  skip: number;
  take: number;
}

export type CreateFormOutcome =
  | { kind: 'created'; form: FormDetail }
  | { kind: 'invalid_patients' }
  | { kind: 'invalid_fields'; errors: FieldError[] };

export type UpdateFormOutcome =
  | { kind: 'not_found' | 'inactive' | 'invalid_patients' }
  | { kind: 'unchanged' | 'updated'; form: FormDetail };

export interface SaveFormDraftCommand extends TargetFormCommand {
  fields: FormFieldConfig[];
}

export interface PublishFormCommand extends TargetFormCommand {
  confirmImpact: boolean;
}

export type SaveFormDraftOutcome =
  | { kind: 'not_found' | 'inactive' }
  | { kind: 'invalid_fields'; errors: FieldError[] }
  | { kind: 'saved'; form: FormDetail };

export type DiscardFormDraftOutcome =
  | { kind: 'not_found' | 'inactive' | 'no_draft' | 'not_published' }
  | { kind: 'discarded'; form: FormDetail };

export type PublishFormOutcome =
  | {
      kind:
        | 'not_found'
        | 'inactive'
        | 'no_draft'
        | 'empty'
        | 'confirmation_required';
    }
  | { kind: 'published'; form: FormDetail };

export type DeactivateFormOutcome =
  | { kind: 'not_found' | 'already_inactive' }
  | { kind: 'deactivated'; form: FormDetail };

export type ReactivateFormOutcome =
  | { kind: 'not_found' | 'already_active' }
  | { kind: 'reactivated'; form: FormDetail };
