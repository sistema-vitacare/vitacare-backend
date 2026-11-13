import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AcceptTermsUseCase } from '@/modules/Terms/AcceptTerms/acceptTerms.useCase';
import type { TermsAcceptanceRow } from '@/modules/Terms/types/terms.types';

const ctx: RequestContext = {
  requestId: 'req-1',
  userId: 'user-1',
  organizationId: 'org-1',
  organizationKind: 'tenant',
  profile: ProfileCode.FAMILY,
  permissions: new Set(),
};

const stored: TermsAcceptanceRow = {
  id: 'acc-1',
  version: 2,
  contentHash: 'b'.repeat(64),
  acceptedAt: new Date('2026-11-13T15:00:00Z'),
};

describe('AcceptTermsUseCase (BE-32)', () => {
  const build = (outcome: unknown) => {
    const repo = { accept: jest.fn().mockResolvedValue(outcome) };

    return { repo, useCase: new AcceptTermsUseCase(repo as never) };
  };

  it('grava o aceite da vigente com o navegador normalizado e o contexto da sessao', async () => {
    const { repo, useCase } = build({ row: stored, created: true });

    const result = await useCase.execute(
      { version: 2 },
      ctx,
      'Mozilla/5.0\r\n',
    );

    expect(repo.accept).toHaveBeenCalledWith({
      ctx,
      version: 2,
      userAgent: 'Mozilla/5.0',
    });
    expect(result).toEqual({
      id: 'acc-1',
      version: 2,
      contentHash: 'b'.repeat(64),
      acceptedAt: '2026-11-13T15:00:00.000Z',
      alreadyAccepted: false,
    });
  });

  it('aceite repetido devolve o registro original marcado como ja aceito', async () => {
    const { useCase } = build({ row: stored, created: false });

    await expect(
      useCase.execute({ version: 2 }, ctx, undefined),
    ).resolves.toMatchObject({ id: 'acc-1', alreadyAccepted: true });
  });

  it('versao que nao e a vigente responde 422 TERMS_VERSION_NOT_CURRENT com a vigente no detalhe', async () => {
    const { useCase } = build({ notCurrent: 3 });

    const error = await useCase
      .execute({ version: 2 }, ctx, undefined)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DomainException);
    expect(error).toMatchObject({
      code: 'TERMS_VERSION_NOT_CURRENT',
      status: 422,
      detail: 'Versao informada: 2. Versao vigente: 3.',
    });
  });

  it('sem versao publicada, qualquer aceite e 422 sem versao vigente', async () => {
    const { useCase } = build({ notCurrent: null });

    await expect(
      useCase.execute({ version: 1 }, ctx, undefined),
    ).rejects.toMatchObject({
      code: 'TERMS_VERSION_NOT_CURRENT',
      detail: 'Versao informada: 1. Nenhuma versao publicada.',
    });
  });
});
