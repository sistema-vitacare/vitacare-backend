import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:is-public';
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_KEY, true);

export const ALLOWED_SESSION_TYPES_KEY = 'auth:allowed-session-types';
export const AllowSessionTypes = (
  ...types: Array<'normal' | 'password_change'>
): ReturnType<typeof SetMetadata> =>
  SetMetadata(ALLOWED_SESSION_TYPES_KEY, types);
