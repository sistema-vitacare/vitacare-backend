import { SetMetadata } from '@nestjs/common';

import type { AuthSessionType } from '../entities/authSession.entity';

export const IS_PUBLIC_KEY = 'auth:is-public';

/** Rota sem autenticacao: o guard global nao consulta sessao alguma. */
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_KEY, true);

export const ALLOWED_SESSION_TYPES_KEY = 'auth:allowed-session-types';

/**
 * Tipos de sessao aceitos pela rota. Sem este decorator so passa sessao
 * `normal`, entao o token restrito de primeiro acesso nao alcanca o resto da
 * API.
 */
export const AllowSessionTypes = (
  ...types: AuthSessionType[]
): ReturnType<typeof SetMetadata> =>
  SetMetadata(ALLOWED_SESSION_TYPES_KEY, types);

export const ALLOW_PENDING_TERMS_KEY = 'auth:allow-pending-terms';

/**
 * Rota liberada para sessao normal que ainda nao aceitou o termo de uso
 * vigente (BE-32): ler a propria sessao, aceitar o termo e sair. Sem este
 * decorator, a sessao sem aceite recebe `403 TERMS_ACCEPTANCE_REQUIRED`.
 */
export const AllowPendingTerms = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(ALLOW_PENDING_TERMS_KEY, true);
