import type { RequestContext } from '@/common/context/requestContext.type';
import { maskCpf } from '@/modules/User/parsers/user.parser';

import type { CreatePatientDto } from '../CreatePatient/createPatient.dto';
import type { PatientDto } from '../dtos/patient.dto';
import type { PatientAddressInputDto } from '../dtos/patientAddress.dto';
import { readsFullPatientRecord } from '../policies/patient.policy';
import type { UpdatePatientDto } from '../UpdatePatient/updatePatient.dto';
import type {
  PatientFields,
  PatientPatch,
  PatientRow,
} from '../types/patient.types';

const ADDRESS_COLUMNS = {
  zipCode: 'zipCode',
  street: 'street',
  number: 'addressNumber',
  complement: 'addressComplement',
  district: 'district',
  city: 'city',
  state: 'state',
} as const satisfies Record<keyof PatientAddressInputDto, keyof PatientFields>;

type AddressPart = keyof typeof ADDRESS_COLUMNS;

const ADDRESS_PARTS = Object.keys(ADDRESS_COLUMNS) as AddressPart[];

const OPTIONAL_TEXT = [
  'sex',
  'cpf',
  'phone',
  'email',
  'mainCondition',
  'healthPlan',
  'notes',
] as const;

/** `undefined` = nao mexe; `null` = limpa todas as partes. */
const addressPatch = (
  address: PatientAddressInputDto | null | undefined,
): PatientPatch => {
  if (address === undefined) return {};

  return Object.fromEntries(
    ADDRESS_PARTS.filter(
      (part) => address === null || address[part] !== undefined,
    ).map((part) => [ADDRESS_COLUMNS[part], address?.[part] ?? null]),
  );
};

/** Corpo de cadastro -> campos gravados; opcional ausente vira `null`. */
export const toPatientFields = (input: CreatePatientDto): PatientFields => ({
  name: input.name,
  birthDate: input.birthDate,
  sex: input.sex ?? null,
  cpf: input.cpf ?? null,
  phone: input.phone ?? null,
  email: input.email ?? null,
  zipCode: null,
  street: null,
  addressNumber: null,
  addressComplement: null,
  district: null,
  city: null,
  state: null,
  ...addressPatch(input.address),
  mainCondition: input.mainCondition ?? null,
  secondaryConditions: input.secondaryConditions ?? [],
  healthPlan: input.healthPlan ?? null,
  notes: input.notes ?? null,
});

/** Corpo de edicao -> so o que veio; `null` em lista vira lista vazia. */
export const toPatientPatch = (input: UpdatePatientDto): PatientPatch => ({
  ...(input.name !== undefined && { name: input.name }),
  ...(input.birthDate !== undefined && { birthDate: input.birthDate }),
  ...Object.fromEntries(
    OPTIONAL_TEXT.filter((field) => input[field] !== undefined).map((field) => [
      field,
      input[field],
    ]),
  ),
  ...addressPatch(input.address),
  ...(input.secondaryConditions !== undefined && {
    secondaryConditions: input.secondaryConditions ?? [],
  }),
});

/**
 * Mascara dos campos fora do recorte do familiar. Fixa e aplicada mesmo ao
 * campo vazio, para nao revelar tamanho nem se o dado foi preenchido.
 */
export const HIDDEN_PATIENT_VALUE = '********';

/**
 * Paciente -> resposta. Para o familiar, os campos fora do recorte da
 * Figura 37 saem mascarados, no mesmo formato.
 */
export const toPatientResponse = (
  patient: PatientRow,
  ctx: RequestContext,
  options: { maskCpf?: boolean } = {},
): PatientDto => {
  const full = readsFullPatientRecord(ctx);
  const visible = (value: string | null): string | null =>
    full ? value : HIDDEN_PATIENT_VALUE;

  return {
    id: patient.id,
    name: patient.name,
    birthDate: patient.birthDate,
    sex: patient.sex,
    cpf: visible(
      patient.cpf && options.maskCpf ? maskCpf(patient.cpf) : patient.cpf,
    ),
    phone: visible(patient.phone),
    email: visible(patient.email),
    address: {
      zipCode: visible(patient.zipCode),
      street: visible(patient.street),
      number: visible(patient.addressNumber),
      complement: visible(patient.addressComplement),
      district: visible(patient.district),
      city: visible(patient.city),
      state: visible(patient.state),
    },
    mainCondition: patient.mainCondition,
    secondaryConditions: patient.secondaryConditions,
    healthPlan: visible(patient.healthPlan),
    notes: visible(patient.notes),
    status: patient.status,
    responsible:
      patient.responsibleId &&
      patient.responsibleName &&
      patient.responsibleStatus
        ? {
            id: patient.responsibleId,
            name: patient.responsibleName,
            status: patient.responsibleStatus,
          }
        : null,
    viewerLink: patient.viewerLinkRole
      ? { role: patient.viewerLinkRole, linkType: patient.viewerLinkType }
      : null,
    createdAt: patient.createdAt.toISOString(),
    updatedAt: patient.updatedAt.toISOString(),
    deletedAt: patient.deletedAt?.toISOString() ?? null,
  };
};
