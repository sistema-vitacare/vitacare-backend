import {
  toPatientFields,
  toPatientPatch,
  toPatientResponse,
} from '@/modules/Patient/parsers/patient.parser';

import { ProfileCode } from '@/common/context/requestContext.type';

import { patientRow, professionalCtx, sessionOf } from './patient.fixtures';

/** Mascara fixa: nao revela tamanho nem se o campo foi preenchido. */
const HIDDEN = '********';

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
      addressComplement: null,
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
    expect(
      toPatientPatch({
        phone: null,
        address: { number: '10', complement: 'Casa 2' },
      }),
    ).toEqual({
      phone: null,
      addressNumber: '10',
      addressComplement: 'Casa 2',
    });
    expect(toPatientPatch({ secondaryConditions: null })).toEqual({
      secondaryConditions: [],
    });
    expect(toPatientPatch({ address: null })).toEqual({
      zipCode: null,
      street: null,
      addressNumber: null,
      addressComplement: null,
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

  it('familiar: recorte da Figura 37, com documento, contato, endereco, plano e observacoes sempre mascarados', () => {
    const row = patientRow({
      phone: '(11) 98765-4321',
      email: 'paciente@example.test',
      healthPlan: 'Plano Exemplo',
      notes: 'Observacao sintetica',
      viewerLinkRole: 'family',
      viewerLinkType: 'Filha',
    });

    expect(toPatientResponse(row, sessionOf(ProfileCode.FAMILY))).toEqual({
      id: row.id,
      name: 'Paciente Sintetico',
      birthDate: '1948-03-12',
      sex: 'female',
      cpf: HIDDEN,
      phone: HIDDEN,
      email: HIDDEN,
      address: {
        zipCode: HIDDEN,
        street: HIDDEN,
        number: HIDDEN,
        complement: HIDDEN,
        district: HIDDEN,
        city: HIDDEN,
        state: HIDDEN,
      },
      mainCondition: 'Hipertensao arterial',
      secondaryConditions: ['Diabetes tipo 2'],
      healthPlan: HIDDEN,
      notes: HIDDEN,
      status: 'active',
      responsible: {
        id: row.responsibleId,
        name: 'Profissional Sintetico',
        status: 'active',
      },
      viewerLink: { role: 'family', linkType: 'Filha' },
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
      deletedAt: null,
    });
  });

  it('viewerLink: vinculo de quem le; null para quem le a organizacao inteira', () => {
    const caregiver = toPatientResponse(
      patientRow({ viewerLinkRole: 'caregiver', viewerLinkType: null }),
      sessionOf(ProfileCode.CAREGIVER),
    );

    expect(caregiver.viewerLink).toEqual({ role: 'caregiver', linkType: null });
    expect(caregiver).toMatchObject({
      cpf: '52998224725',
      address: { street: 'Avenida Exemplo' },
    });
    expect(
      toPatientResponse(patientRow(), professionalCtx).viewerLink,
    ).toBeNull();
  });
});
