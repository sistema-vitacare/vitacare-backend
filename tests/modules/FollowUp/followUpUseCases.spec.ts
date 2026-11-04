import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AnnulFollowUpUseCase } from '@/modules/FollowUp/AnnulFollowUp/annulFollowUp.useCase';
import type { CreateFollowUpDto } from '@/modules/FollowUp/CreateFollowUp/createFollowUp.dto';
import { CreateFollowUpUseCase } from '@/modules/FollowUp/CreateFollowUp/createFollowUp.useCase';
import { GetFollowUpUseCase } from '@/modules/FollowUp/GetFollowUp/getFollowUp.useCase';
import type { FollowUpRepository } from '@/modules/FollowUp/repositories/followUp.repository';

import { ACTOR_ID, sessionOf } from '../Patient/patient.fixtures';
import {
  FOLLOW_UP_FORM_ID,
  FOLLOW_UP_ID,
  FOLLOW_UP_PATIENT_ID,
  FOLLOW_UP_VERSION_ID,
  GLICEMIA_FIELD_ID,
  followUpDetail,
} from './followUp.fixtures';

const repository = {
  create: jest.fn(),
  annul: jest.fn(),
  list: jest.fn(),
  findById: jest.fn(),
};
const followUps = repository as unknown as FollowUpRepository;

const caregiver = sessionOf(ProfileCode.CAREGIVER);
const professional = sessionOf(ProfileCode.PROFESSIONAL);

const body = (
  overrides: Partial<CreateFollowUpDto> = {},
): CreateFollowUpDto => ({
  patientId: FOLLOW_UP_PATIENT_ID,
  formId: FOLLOW_UP_FORM_ID,
  formVersionId: FOLLOW_UP_VERSION_ID,
  answers: [{ fieldId: GLICEMIA_FIELD_ID, value: 0 }],
  ...overrides,
});

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DomainException);

    const exception = error as DomainException;

    return {
      code: exception.code,
      status: exception.getStatus(),
      fields: exception.fields,
    };
  }

  throw new Error('Era esperada uma DomainException.');
};

beforeEach(() => jest.resetAllMocks());

describe('CreateFollowUpUseCase', () => {
  const useCase = new CreateFollowUpUseCase(followUps);

  it('autoria, organizacao e escopo do cuidador vem da sessao', async () => {
    repository.create.mockResolvedValue({
      kind: 'created',
      followUp: followUpDetail(),
    });

    await useCase.execute(
      body({ visitedAt: '2026-11-04T09:30:00-03:00', notes: 'Visita' }),
      caregiver,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: caregiver.organizationId,
        viewerUserId: ACTOR_ID,
        viewerLinkRoles: ['caregiver'],
        actorUserId: ACTOR_ID,
        requestId: caregiver.requestId,
        visitedAt: new Date('2026-11-04T12:30:00.000Z'),
        notes: 'Visita',
      }),
    );
  });

  it('sem visitedAt usa o momento do envio', async () => {
    repository.create.mockResolvedValue({
      kind: 'created',
      followUp: followUpDetail(),
    });
    const before = Date.now();

    await useCase.execute(body(), caregiver);

    const [{ visitedAt }] = repository.create.mock.calls[0] as [
      { visitedAt: Date },
    ];

    expect(visitedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(visitedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('visita no futuro e recusada sem tocar o banco', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    expect(
      await codeOf(useCase.execute(body({ visitedAt: future }), caregiver)),
    ).toMatchObject({
      code: 'FOLLOW_UP_INVALID_VISITED_AT',
      status: 422,
      fields: [{ field: 'visitedAt', code: 'IN_FUTURE' }],
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each([
    ['patient_not_found', 'PATIENT_NOT_FOUND', 404],
    ['patient_inactive', 'FOLLOW_UP_PATIENT_INACTIVE', 409],
    ['form_not_found', 'FORM_NOT_FOUND', 404],
    ['form_inactive', 'FORM_INACTIVE', 409],
    ['form_not_applicable', 'FOLLOW_UP_FORM_NOT_APPLICABLE', 422],
    ['version_outdated', 'FOLLOW_UP_FORM_VERSION_OUTDATED', 409],
    ['empty', 'FOLLOW_UP_EMPTY', 422],
  ])('%s vira %s', async (kind, code, status) => {
    repository.create.mockResolvedValue({ kind });

    expect(await codeOf(useCase.execute(body(), caregiver))).toMatchObject({
      code,
      status,
    });
  });

  it('respostas invalidas saem com os erros por campo', async () => {
    const errors = [{ field: 'answers.0.value', code: 'NOT_A_NUMBER' }];

    repository.create.mockResolvedValue({ kind: 'invalid_answers', errors });

    expect(await codeOf(useCase.execute(body(), caregiver))).toMatchObject({
      code: 'FOLLOW_UP_INVALID_ANSWERS',
      status: 422,
      fields: errors,
    });
  });
});

describe('AnnulFollowUpUseCase', () => {
  const useCase = new AnnulFollowUpUseCase(followUps);

  it('profissional anula qualquer registro; cuidador so no seu escopo', async () => {
    repository.annul.mockResolvedValue({
      kind: 'annulled',
      followUp: followUpDetail(),
    });

    await useCase.execute(FOLLOW_UP_ID, { reason: 'Erro' }, professional);
    await useCase.execute(FOLLOW_UP_ID, { reason: 'Erro' }, caregiver);

    expect(repository.annul).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ annulAny: true, viewerUserId: null }),
    );
    expect(repository.annul).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        annulAny: false,
        viewerUserId: ACTOR_ID,
        viewerLinkRoles: ['caregiver'],
      }),
    );
  });

  it.each([
    ['not_found', 'FOLLOW_UP_NOT_FOUND', 404],
    ['not_author', 'FOLLOW_UP_NOT_AUTHOR', 403],
    ['already_annulled', 'FOLLOW_UP_ALREADY_ANNULLED', 409],
  ])('%s vira %s', async (kind, code, status) => {
    repository.annul.mockResolvedValue({ kind });

    expect(
      await codeOf(
        useCase.execute(FOLLOW_UP_ID, { reason: 'Erro' }, caregiver),
      ),
    ).toMatchObject({ code, status });
  });
});

describe('GetFollowUpUseCase', () => {
  it('fora do alcance e 404', async () => {
    repository.findById.mockResolvedValue(null);

    expect(
      await codeOf(
        new GetFollowUpUseCase(followUps).execute(
          FOLLOW_UP_ID,
          sessionOf(ProfileCode.FAMILY),
        ),
      ),
    ).toMatchObject({ code: 'FOLLOW_UP_NOT_FOUND', status: 404 });
  });
});
