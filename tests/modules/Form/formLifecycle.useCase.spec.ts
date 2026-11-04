import { ProfileCode } from '@/common/context/requestContext.type';
import { DeactivateFormUseCase } from '@/modules/Form/DeactivateForm/deactivateForm.useCase';
import { DiscardFormDraftUseCase } from '@/modules/Form/DiscardFormDraft/discardFormDraft.useCase';
import { PublishFormUseCase } from '@/modules/Form/PublishForm/publishForm.useCase';
import { ReactivateFormUseCase } from '@/modules/Form/ReactivateForm/reactivateForm.useCase';
import type { FormRepository } from '@/modules/Form/repositories/form.repository';
import { SaveFormDraftUseCase } from '@/modules/Form/SaveFormDraft/saveFormDraft.useCase';

import {
  ACTOR_ID,
  ORGANIZATION_ID,
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

describe('casos de uso de rascunho, publicacao e ciclo de vida', () => {
  const forms = {
    saveDraft: jest.fn(),
    discardDraft: jest.fn(),
    publish: jest.fn(),
    deactivate: jest.fn(),
    reactivate: jest.fn(),
  };
  const repository = forms as unknown as FormRepository;
  const ctx = sessionOf(ProfileCode.PROFESSIONAL);

  beforeEach(() => jest.resetAllMocks());

  it('rascunho vazio e FORM_EMPTY sem tocar o repositorio', async () => {
    const error = await captureError(
      new SaveFormDraftUseCase(repository).execute(
        FORM_ID,
        { fields: [] },
        ctx,
      ),
    );

    expect(error.code).toBe('FORM_EMPTY');
    expect(forms.saveDraft).not.toHaveBeenCalled();
  });

  it('salva rascunho com ator da sessao e campos convertidos', async () => {
    forms.saveDraft.mockResolvedValue({ kind: 'saved', form: formDetail() });

    await new SaveFormDraftUseCase(repository).execute(
      FORM_ID,
      { fields: [glicemia] },
      ctx,
    );

    expect(forms.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        actorUserId: ACTOR_ID,
        formId: FORM_ID,
        fields: [expect.objectContaining({ name: 'Glicemia', unit: null })],
      }),
    );
  });

  it.each([
    ['not_found', 'FORM_NOT_FOUND', 404],
    ['inactive', 'FORM_INACTIVE', 409],
  ])('rascunho: %s vira %s', async (kind, code, status) => {
    forms.saveDraft.mockResolvedValue({ kind });

    const error = await captureError(
      new SaveFormDraftUseCase(repository).execute(
        FORM_ID,
        { fields: [glicemia] },
        ctx,
      ),
    );

    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(status);
  });

  it('rascunho com chave alheia devolve os erros do repositorio', async () => {
    const errors = [{ field: 'fields.0.fieldType', code: 'TYPE_LOCKED' }];

    forms.saveDraft.mockResolvedValue({ kind: 'invalid_fields', errors });

    const error = await captureError(
      new SaveFormDraftUseCase(repository).execute(
        FORM_ID,
        { fields: [glicemia] },
        ctx,
      ),
    );

    expect(error.code).toBe('FORM_INVALID_FIELDS');
    expect(error.fields).toEqual(errors);
  });

  it('publicar sem confirmImpact envia false', async () => {
    forms.publish.mockResolvedValue({ kind: 'published', form: formDetail() });

    await new PublishFormUseCase(repository).execute(FORM_ID, {}, ctx);

    expect(forms.publish).toHaveBeenCalledWith(
      expect.objectContaining({ formId: FORM_ID, confirmImpact: false }),
    );
  });

  it.each([
    ['not_found', 'FORM_NOT_FOUND', 404],
    ['inactive', 'FORM_INACTIVE', 409],
    ['no_draft', 'FORM_NO_DRAFT', 409],
    ['empty', 'FORM_EMPTY', 422],
    ['confirmation_required', 'FORM_IMPACT_CONFIRMATION_REQUIRED', 409],
  ])('publicar: %s vira %s', async (kind, code, status) => {
    forms.publish.mockResolvedValue({ kind });

    const error = await captureError(
      new PublishFormUseCase(repository).execute(
        FORM_ID,
        { confirmImpact: false },
        ctx,
      ),
    );

    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(status);
  });

  it.each([
    ['not_found', 'FORM_NOT_FOUND', 404],
    ['inactive', 'FORM_INACTIVE', 409],
    ['no_draft', 'FORM_NO_DRAFT', 409],
    ['not_published', 'FORM_NOT_PUBLISHED', 409],
  ])('descartar: %s vira %s', async (kind, code, status) => {
    forms.discardDraft.mockResolvedValue({ kind });

    const error = await captureError(
      new DiscardFormDraftUseCase(repository).execute(FORM_ID, ctx),
    );

    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(status);
  });

  it.each([
    ['not_found', 'FORM_NOT_FOUND'],
    ['already_inactive', 'FORM_ALREADY_INACTIVE'],
  ])('desativar: %s vira %s', async (kind, code) => {
    forms.deactivate.mockResolvedValue({ kind });

    const error = await captureError(
      new DeactivateFormUseCase(repository).execute(FORM_ID, ctx),
    );

    expect(error.code).toBe(code);
  });

  it.each([
    ['not_found', 'FORM_NOT_FOUND'],
    ['already_active', 'FORM_ALREADY_ACTIVE'],
  ])('reativar: %s vira %s', async (kind, code) => {
    forms.reactivate.mockResolvedValue({ kind });

    const error = await captureError(
      new ReactivateFormUseCase(repository).execute(FORM_ID, ctx),
    );

    expect(error.code).toBe(code);
  });
});
