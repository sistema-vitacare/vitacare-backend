import { ProfileCode } from '@/common/context/requestContext.type';
import {
  toFieldConfig,
  toFieldColumns,
  toFormResponse,
  toFormSummaryResponse,
} from '@/modules/Form/parsers/form.parser';

import { sessionOf } from '../Patient/patient.fixtures';
import { DRAFT_ID, VERSION_ID, fieldRow, formDetail } from './form.fixtures';

describe('form.parser', () => {
  it('quem configura recebe versao vigente com campos e rascunho', () => {
    const response = toFormResponse(
      formDetail(),
      sessionOf(ProfileCode.PROFESSIONAL),
    );

    expect(response.currentVersion).toEqual({
      id: VERSION_ID,
      number: 1,
      publishedAt: '2026-11-02T10:00:00.000Z',
      fieldCount: 1,
      fields: [
        expect.objectContaining({ name: 'Glicemia capilar', unit: 'mg/dL' }),
      ],
    });
    expect(response.draft?.id).toBe(DRAFT_ID);
    expect(response.hasDraft).toBe(true);
    expect(response.frequency).toEqual({ interval: 1, unit: 'days' });
    expect(response.deactivatedAt).toBeNull();
  });

  it('cuidador nao recebe rascunho nem hasDraft verdadeiro', () => {
    const ctx = sessionOf(ProfileCode.CAREGIVER);
    const detail = toFormResponse(formDetail(), ctx);
    const summary = toFormSummaryResponse(formDetail(), ctx);

    expect(detail).not.toHaveProperty('draft');
    expect(detail.hasDraft).toBe(false);
    expect(summary.hasDraft).toBe(false);
  });

  it('formulario nunca publicado sai sem versao vigente e sem frequencia', () => {
    const response = toFormSummaryResponse(
      formDetail({
        currentVersionId: null,
        currentVersionNumber: null,
        currentPublishedAt: null,
        currentFieldCount: 0,
        frequencyInterval: null,
        frequencyUnit: null,
      }),
      sessionOf(ProfileCode.ADMIN),
    );

    expect(response.currentVersion).toBeNull();
    expect(response.frequency).toBeNull();
  });

  it('requirement vira obrigatorio/ativo do MER e volta', () => {
    expect(toFieldColumns(fieldRow({ requirement: 'required' }))).toMatchObject(
      {
        required: true,
        active: true,
      },
    );
    expect(toFieldColumns(fieldRow({ requirement: 'optional' }))).toMatchObject(
      {
        required: false,
        active: true,
      },
    );
    expect(toFieldColumns(fieldRow({ requirement: 'disabled' }))).toMatchObject(
      {
        required: false,
        active: false,
      },
    );
  });

  it('entrada sem opcionais vira configuracao com nulos, zero preservado', () => {
    expect(
      toFieldConfig({
        name: 'Humor',
        fieldType: 'scale',
        requirement: 'optional',
        scaleMin: 0,
        scaleMax: 10,
      }),
    ).toEqual({
      name: 'Humor',
      fieldType: 'scale',
      requirement: 'optional',
      section: null,
      unit: null,
      decimalPlaces: null,
      scaleMin: 0,
      scaleMax: 10,
      options: null,
    });
  });
});
