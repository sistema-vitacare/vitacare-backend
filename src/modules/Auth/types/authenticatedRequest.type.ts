import type { Request } from 'express';
import type { RequestContext } from '@/common/context/requestContext.type';

export interface AuthenticatedRequest extends Request {
  context?: RequestContext;
  authSessionId?: string;
}
