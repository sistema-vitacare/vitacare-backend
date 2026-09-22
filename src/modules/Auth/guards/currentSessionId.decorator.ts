import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../types/authenticatedRequest.type';

export const CurrentSessionId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const id = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().authSessionId;
    if (!id) throw new Error('Sessão autenticada ausente.');
    return id;
  },
);
