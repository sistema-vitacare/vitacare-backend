import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import type { CreateMedicationDto } from '@/modules/Medication/CreateMedication/createMedication.dto';
import { CreateMedicationUseCase } from '@/modules/Medication/CreateMedication/createMedication.useCase';
import { DeactivateMedicationUseCase } from '@/modules/Medication/DeactivateMedication/deactivateMedication.useCase';
import { GetMedicationUseCase } from '@/modules/Medication/GetMedication/getMedication.useCase';
import { ListMedicationsUseCase } from '@/modules/Medication/ListMedications/listMedications.useCase';
import { ReactivateMedicationUseCase } from '@/modules/Medication/ReactivateMedication/reactivateMedication.useCase';
import type { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';
import { UpdateMedicationUseCase } from '@/modules/Medication/UpdateMedication/updateMedication.useCase';

import {
  ACTOR_ID,
  ORGANIZATION_ID,
  PATIENT_ID,
  sessionOf,
} from '../Patient/patient.fixtures';
import { MEDICATION_ID, medicationRow } from './medication.fixtures';

const repository = {
  create: jest.fn(),
  list: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  reactivate: jest.fn(),
};
const medications = repository as unknown as MedicationRepository;

const professional = sessionOf(ProfileCode.PROFESSIONAL);
const caregiver = sessionOf(ProfileCode.CAREGIVER);
const view = { medication: medicationRow(), others: [] };

const body = (
  overrides: Partial<CreateMedicationDto> = {},
): CreateMedicationDto => ({
  patientId: PATIENT_ID,
  name: 'Losartana',
  doseAmount: 50,
  doseUnit: 'mg',
  times: ['08:00'],
  ...overrides,
});

const failureOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DomainException);

    const exception = error as DomainException;

    return { code: exception.code, status: exception.getStatus() };
  }

  throw new Error('Era esperada uma DomainException.');
};

beforeEach(() => jest.resetAllMocks());

describe('CreateMedicationUseCase', () => {
  const useCase = () => new CreateMedicationUseCase(medications);

  it('grava com organizacao, ator e escopo da sessao', async () => {
    repository.create.mockResolvedValue({ kind: 'created', ...view });

    const result = await useCase().execute(body(), professional);

    expect(result.id).toBe(MEDICATION_ID);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        actorUserId: ACTOR_ID,
        requestId: professional.requestId,
        viewerUserId: null,
        patientId: PATIENT_ID,
      }),
    );
  });

  it.each([
    ['patient_not_found', 'PATIENT_NOT_FOUND', 404],
    ['patient_inactive', 'MEDICATION_PATIENT_INACTIVE', 409],
  ])('%s vira %s', async (kind, code, status) => {
    repository.create.mockResolvedValue({ kind });

    expect(await failureOf(useCase().execute(body(), professional))).toEqual({
      code,
      status,
    });
  });
});

describe('ListMedicationsUseCase', () => {
  it('cuidador lista so com o escopo do vinculo', async () => {
    repository.list.mockResolvedValue({
      kind: 'ok',
      items: [medicationRow()],
      total: 1,
      others: [],
    });

    const result = await new ListMedicationsUseCase(medications).execute(
      { patientId: PATIENT_ID, page: 1, limit: 20, skip: 0 },
      caregiver,
    );

    expect(result.data).toHaveLength(1);
    expect(result.extras.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerUserId: ACTOR_ID,
        viewerLinkRoles: ['caregiver'],
      }),
      { patientId: PATIENT_ID, status: undefined, skip: 0, take: 20 },
    );
  });

  it('paciente fora do alcance vira PATIENT_NOT_FOUND', async () => {
    repository.list.mockResolvedValue({ kind: 'patient_not_found' });

    expect(
      await failureOf(
        new ListMedicationsUseCase(medications).execute(
          { patientId: PATIENT_ID, page: 1, limit: 20, skip: 0 },
          caregiver,
        ),
      ),
    ).toEqual({ code: 'PATIENT_NOT_FOUND', status: 404 });
  });
});

describe('GetMedicationUseCase', () => {
  it('inexistente ou fora do alcance vira MEDICATION_NOT_FOUND', async () => {
    repository.findById.mockResolvedValue(null);

    expect(
      await failureOf(
        new GetMedicationUseCase(medications).execute(MEDICATION_ID, caregiver),
      ),
    ).toEqual({ code: 'MEDICATION_NOT_FOUND', status: 404 });
  });
});

describe('UpdateMedicationUseCase', () => {
  const useCase = () => new UpdateMedicationUseCase(medications);

  it('corpo vazio nem chega ao repositorio', async () => {
    expect(
      await failureOf(useCase().execute(MEDICATION_ID, {}, professional)),
    ).toEqual({ code: 'MEDICATION_NOTHING_TO_UPDATE', status: 422 });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 'MEDICATION_NOT_FOUND', 404],
    ['inactive', 'MEDICATION_INACTIVE', 409],
    ['patient_inactive', 'MEDICATION_PATIENT_INACTIVE', 409],
    ['invalid_period', 'MEDICATION_INVALID_PERIOD', 422],
    ['unchanged', 'MEDICATION_NOTHING_TO_UPDATE', 422],
  ])('%s vira %s', async (kind, code, status) => {
    repository.update.mockResolvedValue({ kind });

    expect(
      await failureOf(
        useCase().execute(MEDICATION_ID, { name: 'Outro' }, professional),
      ),
    ).toEqual({ code, status });
  });

  it('repassa so os campos enviados', async () => {
    repository.update.mockResolvedValue({ kind: 'updated', ...view });

    await useCase().execute(
      MEDICATION_ID,
      { endDate: null, times: ['20:00', '08:00'] },
      professional,
    );

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        medicationId: MEDICATION_ID,
        fields: {},
        schedule: { endDate: null, times: ['08:00', '20:00'] },
      }),
    );
  });
});

describe('inativacao e reativacao', () => {
  it.each([
    ['not_found', 'MEDICATION_NOT_FOUND', 404],
    ['already_inactive', 'MEDICATION_ALREADY_INACTIVE', 409],
  ])('inativar: %s vira %s', async (kind, code, status) => {
    repository.deactivate.mockResolvedValue({ kind });

    expect(
      await failureOf(
        new DeactivateMedicationUseCase(medications).execute(
          MEDICATION_ID,
          professional,
        ),
      ),
    ).toEqual({ code, status });
  });

  it.each([
    ['not_found', 'MEDICATION_NOT_FOUND', 404],
    ['already_active', 'MEDICATION_ALREADY_ACTIVE', 409],
    ['patient_inactive', 'MEDICATION_PATIENT_INACTIVE', 409],
  ])('reativar: %s vira %s', async (kind, code, status) => {
    repository.reactivate.mockResolvedValue({ kind });

    expect(
      await failureOf(
        new ReactivateMedicationUseCase(medications).execute(
          MEDICATION_ID,
          professional,
        ),
      ),
    ).toEqual({ code, status });
  });

  it('inativar devolve o medicamento inativo', async () => {
    repository.deactivate.mockResolvedValue({
      kind: 'deactivated',
      medication: medicationRow({
        status: 'inactive',
        deletedAt: new Date('2026-11-05T12:00:00Z'),
      }),
      others: [],
    });

    const result = await new DeactivateMedicationUseCase(medications).execute(
      MEDICATION_ID,
      professional,
    );

    expect(result.status).toBe('inactive');
    expect(result.nextScheduledAt).toBeNull();
  });
});
