import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import { AuthTransactionRepository } from '../repositories/authTransaction.repository';

@Injectable()
export class LogoutUseCase {
  constructor(private readonly transactions: AuthTransactionRepository) {}

  /**
   * Encerra somente a sessao apresentada; os outros dispositivos seguem. A
   * revogacao e o evento de auditoria saem juntos, na organizacao e no usuario
   * do proprio token — nunca em um identificador solto.
   */
  async execute(sessionId: string, context: RequestContext): Promise<null> {
    await this.transactions.recordLogout({
      sessionId,
      userId: context.userId,
      organizationId: context.organizationId,
      requestId: context.requestId,
    });

    return null;
  }
}
