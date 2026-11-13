import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type {
  AcceptTermsDto,
  TermsAcceptanceDto,
} from '../dtos/termsAcceptance.dto';
import { toTermsAcceptanceResponse } from '../parsers/termsAcceptance.parser';
import { normalizeUserAgent } from '../policies/userAgent.policy';
import { TermsAcceptanceRepository } from '../repositories/termsAcceptance.repository';
import { TermsErrors } from '../terms.errors';

/**
 * Aceite do termo vigente (BE-32). A versao vem no corpo para ninguem aceitar
 * um texto diferente do que leu; autor, organizacao, perfil, IP e requisicao
 * vem da sessao e do servidor.
 */
@Injectable()
export class AcceptTermsUseCase {
  constructor(private readonly acceptances: TermsAcceptanceRepository) {}

  async execute(
    input: AcceptTermsDto,
    ctx: RequestContext,
    userAgent: string | string[] | undefined,
  ): Promise<TermsAcceptanceDto> {
    const outcome = await this.acceptances.accept({
      ctx,
      version: input.version,
      userAgent: normalizeUserAgent(userAgent),
    });

    if ('notCurrent' in outcome) {
      throw new DomainException({
        ...TermsErrors.VERSION_NOT_CURRENT,
        detail:
          outcome.notCurrent === null
            ? `Versao informada: ${input.version}. Nenhuma versao publicada.`
            : `Versao informada: ${input.version}. Versao vigente: ${outcome.notCurrent}.`,
      });
    }

    return toTermsAcceptanceResponse(outcome.row, !outcome.created);
  }
}
