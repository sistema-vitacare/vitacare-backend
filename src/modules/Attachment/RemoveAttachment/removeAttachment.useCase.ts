import { Injectable, Logger } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { Permissions } from '@/modules/Access/access.permissions';
import { hasPermission } from '@/modules/Access/policies/access.policy';
import { patientScope } from '@/modules/Patient/policies/patient.policy';
import { FileStorageService } from '@/storage/fileStorage.service';

import { AttachmentErrors } from '../attachment.errors';
import { AttachmentRepository } from '../repositories/attachment.repository';

/**
 * Remocao logica + arquivo apagado (decisao de Mateus, 2026-11-05). Admin e
 * profissional (`follow_ups:annul`) removem qualquer anexo da organizacao; o
 * cuidador, so os que enviou, de paciente ainda vinculado. O arquivo e apagado
 * depois do COMMIT: se falhar, a linha ja esta removida e o arquivo fica
 * inacessivel.
 */
@Injectable()
export class RemoveAttachmentUseCase {
  private readonly logger = new Logger(RemoveAttachmentUseCase.name);

  constructor(
    private readonly attachments: AttachmentRepository,
    private readonly storage: FileStorageService,
  ) {}

  async execute(
    followUpId: string,
    attachmentId: string,
    ctx: RequestContext,
  ): Promise<void> {
    const outcome = await this.attachments.remove({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      followUpId,
      attachmentId,
      removeAny: hasPermission(ctx, Permissions.FOLLOW_UPS_ANNUL),
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...AttachmentErrors.NOT_FOUND,
          detail:
            'Anexo inexistente, ja removido ou de paciente fora do alcance.',
        });
      case 'not_author':
        throw new DomainException({
          ...AttachmentErrors.NOT_AUTHOR,
          detail: 'Sem follow_ups:annul, so quem enviou remove o anexo.',
        });
      case 'removed':
        try {
          await this.storage.remove(outcome.storageKey);
        } catch (error) {
          this.logger.warn(
            `Arquivo orfao (inacessivel) apos remocao: ${outcome.storageKey} (${(error as Error).message})`,
          );
        }
    }
  }
}
