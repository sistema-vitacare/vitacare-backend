import { ProfileCode } from '@/common/context/requestContext.type';
import { ListPatientsQueryDto } from '@/modules/Patient/ListPatients/listPatients.dto';
import { ListPatientsUseCase } from '@/modules/Patient/ListPatients/listPatients.useCase';
import type { PatientRepository } from '@/modules/Patient/repositories/patient.repository';
import {
  CAREGIVER_NO_LINK_MESSAGE,
  FAMILY_NO_LINK_MESSAGE,
  PATIENTS_EMPTY_MESSAGE,
} from '@/modules/Patient/types/patient.types';

import { patientRow, sessionOf } from './patient.fixtures';

const repository = { list: jest.fn(), hasCareLink: jest.fn() };
const useCase = new ListPatientsUseCase(
  repository as unknown as PatientRepository,
);

const query = (overrides: Partial<ListPatientsQueryDto> = {}) =>
  Object.assign(new ListPatientsQueryDto(), { page: 1, limit: 20 }, overrides);

describe('ListPatientsUseCase', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    repository.list.mockResolvedValue([[], 0]);
  });

  it.each([
    [ProfileCode.FAMILY, FAMILY_NO_LINK_MESSAGE],
    [ProfileCode.CAREGIVER, CAREGIVER_NO_LINK_MESSAGE],
  ] as const)(
    '%s sem vinculo vigente: 200 vazio com a orientacao, com e sem filtros',
    async (profile, message) => {
      repository.hasCareLink.mockResolvedValue(false);

      for (const filters of [{}, { search: 'Maria', status: 'inactive' }]) {
        const result = await useCase.execute(
          query(filters as Partial<ListPatientsQueryDto>),
          sessionOf(profile),
        );

        expect(result.data).toEqual([]);
        expect(result.extras.message).toBe(message);
      }
    },
  );

  it.each([ProfileCode.FAMILY, ProfileCode.CAREGIVER] as const)(
    '%s com vinculo e busca sem resultado: aviso generico, nao a orientacao',
    async (profile) => {
      repository.hasCareLink.mockResolvedValue(true);

      const result = await useCase.execute(
        query({ search: 'Inexistente' }),
        sessionOf(profile),
      );

      expect(result.extras.message).toBe(PATIENTS_EMPTY_MESSAGE);
    },
  );

  it.each([ProfileCode.ADMIN, ProfileCode.PROFESSIONAL] as const)(
    '%s com busca vazia: aviso generico sem consultar vinculo',
    async (profile) => {
      const result = await useCase.execute(query(), sessionOf(profile));

      expect(result.extras.message).toBe(PATIENTS_EMPTY_MESSAGE);
      expect(repository.hasCareLink).not.toHaveBeenCalled();
    },
  );

  it('com pacientes: sem meta.message e sem consultar vinculo', async () => {
    repository.list.mockResolvedValue([[patientRow()], 1]);

    const result = await useCase.execute(
      query(),
      sessionOf(ProfileCode.FAMILY),
    );

    expect(result.data).toHaveLength(1);
    expect(result.extras.message).toBeUndefined();
    expect(repository.hasCareLink).not.toHaveBeenCalled();
  });

  it('pagina alem do fim com pacientes no filtro: sem meta.message', async () => {
    repository.list.mockResolvedValue([[], 3]);

    const result = await useCase.execute(
      query({ page: 9 }),
      sessionOf(ProfileCode.FAMILY),
    );

    expect(result.extras.message).toBeUndefined();
  });
});
