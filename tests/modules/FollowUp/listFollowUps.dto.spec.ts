import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListFollowUpsQueryDto } from '@/modules/FollowUp/ListFollowUps/listFollowUps.dto';

import { FOLLOW_UP_PATIENT_ID } from './followUp.fixtures';

const UUID = '7a5b3c1d-0000-4000-8000-00000000000a';

/** Mesmas opcoes do `ValidationPipe` global de `app.setup.ts`. */
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true };

const parse = (query: Record<string, unknown>) =>
  plainToInstance(ListFollowUpsQueryDto, {
    patientId: FOLLOW_UP_PATIENT_ID,
    ...query,
  });

const invalidFields = async (query: Record<string, unknown>) =>
  (await validate(parse(query), PIPE_OPTIONS)).map((error) => error.property);

describe('ListFollowUpsQueryDto', () => {
  it('aceita todos os filtros combinados', async () => {
    expect(
      await invalidFields({
        status: 'valid',
        from: '2026-11-01',
        to: '2026-11-06',
        formId: UUID,
        authorUserId: UUID,
        fieldKey: UUID,
        section: 'Sinais vitais',
      }),
    ).toEqual([]);
  });

  it('aceita periodo de um dia so e periodo aberto em uma ponta', async () => {
    expect(
      await invalidFields({ from: '2026-11-06', to: '2026-11-06' }),
    ).toEqual([]);
    expect(await invalidFields({ from: '2026-11-06' })).toEqual([]);
    expect(await invalidFields({ to: '2026-11-06' })).toEqual([]);
  });

  it.each(['2026-02-30', '06/11/2026', '2026-11-06T00:00:00Z', ''])(
    'recusa data fora de AAAA-MM-DD existente: %p',
    async (value) => {
      expect(await invalidFields({ from: value, to: value })).toEqual([
        'from',
        'to',
      ]);
    },
  );

  it('recusa fim anterior ao inicio', async () => {
    expect(
      await invalidFields({ from: '2026-11-06', to: '2026-11-05' }),
    ).toEqual(['to']);
  });

  it('recusa identificadores que nao sao uuid', async () => {
    expect(
      (
        await invalidFields({
          formId: 'x',
          authorUserId: 'x',
          fieldKey: 'x',
        })
      ).sort(),
    ).toEqual(['authorUserId', 'fieldKey', 'formId']);
  });

  it('apara a secao e recusa secao vazia ou acima de 60 caracteres', async () => {
    expect(parse({ section: '  Sinais vitais ' }).section).toBe(
      'Sinais vitais',
    );
    expect(await invalidFields({ section: '   ' })).toEqual(['section']);
    expect(await invalidFields({ section: 'x'.repeat(61) })).toEqual([
      'section',
    ]);
  });
});
