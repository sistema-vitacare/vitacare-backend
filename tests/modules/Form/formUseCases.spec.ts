import { ProfileCode } from '@/common/context/requestContext.type';
import { CreateFormUseCase } from '@/modules/Form/CreateForm/createForm.useCase';
import type { CreateFormDto } from '@/modules/Form/CreateForm/createForm.dto';
import { GetFormUseCase } from '@/modules/Form/GetForm/getForm.useCase';
import { ListFormsUseCase } from '@/modules/Form/ListForms/listForms.useCase';
import { ListFormsQueryDto } from '@/modules/Form/ListForms/listForms.dto';
import type { FormRepository } from '@/modules/Form/repositories/form.repository';
import { UpdateFormUseCase } from '@/modules/Form/UpdateForm/updateForm.useCase';

import {
  ACTOR_ID,
  ORGANIZATION_ID,
  PATIENT_ID,
  captureError,
  sessionOf,
} from '../Patient/patient.fixtures';
import { FORM_ID, formDetail } from './form.fixtures';

const glicemia = {
  name: 'Glicemia',
  fieldType: 'number' as const,
  requirement: 'required' as const,
  decimalPlaces: 0,
};

const createBody = (overrides: Partial<CreateFormDto> = {}): CreateFormDto => ({
  name: 'Acompanhamento Geral',
  audience: 'organization',
  fields: [glicemia],
  ...overrides,
});

describe('casos de uso de formularios (dados e leitura)', () => {
  const forms = {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
  };
  const repository = forms as unknown as FormRepository;
  const ctx = sessionOf(ProfileCode.PROFESSIONAL);

  beforeEach(() => jest.resetAllMocks());

  it('cria com escopo, ator e requestId da sessao', async () => {
    forms.create.mockResolvedValue({ kind: 'created', form: formDetail() });

    await new CreateFormUseCase(repository).execute(createBody(), ctx);

    expect(forms.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        viewerUserId: null,
        actorUserId: ACTOR_ID,
        requestId: ctx.requestId,
        audience: 'organization',
        patientIds: [],
        properties: {
          name: 'Acompanhamento Geral',
          description: null,
          trackingType: null,
          frequency: null,
        },
      }),
    );
  });

  it('formulario sem campos e FORM_EMPTY sem tocar o repositorio', async () => {
    const error = await captureError(
      new CreateFormUseCase(repository).execute(
        createBody({ fields: [] }),
        ctx,
      ),
    );

    expect(error.code).toBe('FORM_EMPTY');
    expect(error.getStatus()).toBe(422);
    expect(forms.create).not.toHaveBeenCalled();
  });

  it('configuracao incoerente e FORM_INVALID_FIELDS com os caminhos', async () => {
    const error = await captureError(
      new CreateFormUseCase(repository).execute(
        createBody({ fields: [{ ...glicemia, decimalPlaces: undefined }] }),
        ctx,
      ),
    );

    expect(error.code).toBe('FORM_INVALID_FIELDS');
    expect(error.fields).toEqual([
      { field: 'fields[0].decimalPlaces', code: 'REQUIRED' },
    ]);
    expect(forms.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'invalid_patients' }, 'FORM_INVALID_PATIENTS', 422],
    [
      {
        kind: 'invalid_fields',
        errors: [{ field: 'fields[0].fieldKey', code: 'UNKNOWN' }],
      },
      'FORM_INVALID_FIELDS',
      422,
    ],
  ])('criar: %p vira %s', async (outcome, code, status) => {
    forms.create.mockResolvedValue(outcome);

    const error = await captureError(
      new CreateFormUseCase(repository).execute(createBody(), ctx),
    );

    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(status);
  });

  it('editar sem campos e FORM_NOTHING_TO_UPDATE', async () => {
    const error = await captureError(
      new UpdateFormUseCase(repository).execute(FORM_ID, {}, ctx),
    );

    expect(error.code).toBe('FORM_NOTHING_TO_UPDATE');
    expect(forms.update).not.toHaveBeenCalled();
  });

  it('editar com frequencia nula pede para limpar', async () => {
    forms.update.mockResolvedValue({ kind: 'updated', form: formDetail() });

    await new UpdateFormUseCase(repository).execute(
      FORM_ID,
      { frequency: null },
      ctx,
    );

    expect(forms.update).toHaveBeenCalledWith(
      expect.objectContaining({ formId: FORM_ID, patch: { frequency: null } }),
    );
  });

  it.each([
    ['not_found', 'FORM_NOT_FOUND', 404],
    ['inactive', 'FORM_INACTIVE', 409],
    ['invalid_patients', 'FORM_INVALID_PATIENTS', 422],
  ])('editar: %s vira %s', async (kind, code, status) => {
    forms.update.mockResolvedValue({ kind });

    const error = await captureError(
      new UpdateFormUseCase(repository).execute(FORM_ID, { name: 'Novo' }, ctx),
    );

    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(status);
  });

  it('consultar inexistente e FORM_NOT_FOUND', async () => {
    forms.findById.mockResolvedValue(null);

    const error = await captureError(
      new GetFormUseCase(repository).execute(FORM_ID, ctx),
    );

    expect(error.code).toBe('FORM_NOT_FOUND');
  });

  it('listar por paciente fora do alcance e PATIENT_NOT_FOUND', async () => {
    forms.list.mockResolvedValue(null);

    const query = Object.assign(new ListFormsQueryDto(), {
      patientId: PATIENT_ID,
    });
    const error = await captureError(
      new ListFormsUseCase(repository).execute(query, ctx),
    );

    expect(error.code).toBe('PATIENT_NOT_FOUND');
    expect(error.getStatus()).toBe(404);
  });
});
