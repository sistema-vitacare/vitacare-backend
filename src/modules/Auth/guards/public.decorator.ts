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
