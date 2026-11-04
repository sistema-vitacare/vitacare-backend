import {
  toPatientFields,
  toPatientPatch,
  toPatientResponse,
} from '@/modules/Patient/parsers/patient.parser';

import { patientRow, professionalCtx } from './patient.fixtures';

describe('patient.parser', () => {
  it('cadastro: opcional ausente vira null e lista vazia', () => {
    expect(
      toPatientFields({
        name: 'Paciente',
        birthDate: '1950-01-01',
        responsibleUserId: 'x',
        address: { city: 'Santos' },
      }),
    ).toEqual({
      name: 'Paciente',
      birthDate: '1950-01-01',
      sex: null,
      cpf: null,
      phone: null,
      email: null,
      zipCode: null,
      street: null,
      addressNumber: null,
      district: null,
      city: 'Santos',
      state: null,
      mainCondition: null,
      secondaryConditions: [],
      healthPlan: null,
      notes: null,
    });
  });

  it('edicao: so o que veio; null limpa; address null limpa todas as partes', () => {
    expect(toPatientPatch({ phone: null, address: { number: '10' } })).toEqual({
      phone: null,
      addressNumber: '10',
    });
    expect(toPatientPatch({ secondaryConditions: null })).toEqual({
      secondaryConditions: [],
    });
    expect(toPatientPatch({ address: null })).toEqual({
      zipCode: null,
      street: null,
      addressNumber: null,
      district: null,
      city: null,
      state: null,
    });
    expect(toPatientPatch({ responsibleUserId: 'x' })).toEqual({});
  });

  it('resposta: endereco agrupado, responsavel e CPF mascarado sob pedido', () => {
    const response = toPatientResponse(patientRow(), professionalCtx, {
      maskCpf: true,
    });

    expect(response).toMatchObject({
      cpf: '***.982.247-**',
      address: { number: '100', state: 'SP' },
      responsible: { name: 'Profissional Sintetico', status: 'active' },
      createdAt: '2026-11-01T10:00:00.000Z',
      deletedAt: null,
    });
    expect(
      toPatientResponse(
        patientRow({
          cpf: null,
          responsibleId: null,
          responsibleName: null,
          responsibleStatus: null,
        }),
        professionalCtx,
        { maskCpf: true },
      ),
    ).toMatchObject({ cpf: null, responsible: null });
  });
});
