import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import { TENANT_PROFILE_CODES } from '../access.permissions';
import {
  AccessProfileRepository,
  type AccessProfileRecord,
} from '../repositories/accessProfile.repository';
import type { AccessProfileDto } from './listAccessProfiles.dto';
import { toAccessProfileResponse } from './listAccessProfiles.parser';

const KNOWN_ORDER: readonly string[] = TENANT_PROFILE_CODES;

/** Posicao na matriz; codigo desconhecido vai para o fim. */
const rankOf = (code: string): number => {
  const index = KNOWN_ORDER.indexOf(code);

  return index === -1 ? KNOWN_ORDER.length : index;
};

const byDisplayOrder = (
  left: AccessProfileRecord,
  right: AccessProfileRecord,
): number => {
  const byRank = rankOf(left.code) - rankOf(right.code);

  if (byRank !== 0) {
    return byRank;
  }

  if (left.code === right.code) {
    return 0;
  }

  return left.code < right.code ? -1 : 1;
};

/**
 * Catalogo de perfis e permissoes da organizacao da sessao (BE-05, RF005,
 * UC03 passo 3). Ordem de exibicao: a de `TENANT_PROFILES`; perfis fora da
 * matriz vem depois, por codigo.
 */
@Injectable()
export class ListAccessProfilesUseCase {
  constructor(private readonly profiles: AccessProfileRepository) {}

  async execute(ctx: RequestContext): Promise<AccessProfileDto[]> {
    const records = await this.profiles.listLiveWithPermissions(ctx);

    return [...records]
      .sort(byDisplayOrder)
      .map((record) => toAccessProfileResponse(record, ctx));
  }
}
