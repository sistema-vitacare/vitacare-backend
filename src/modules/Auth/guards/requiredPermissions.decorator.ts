import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'auth:required-permissions';
export const RequirePermissions = (
  ...permissions: string[]
): ReturnType<typeof SetMetadata> =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const REQUIRED_ANY_PERMISSIONS_KEY = 'auth:required-any-permissions';
/** A rota exige ao menos uma das permissoes, como leitura de admin ou master. */
export const RequireAnyPermission = (
  ...permissions: string[]
): ReturnType<typeof SetMetadata> =>
  SetMetadata(REQUIRED_ANY_PERMISSIONS_KEY, permissions);
