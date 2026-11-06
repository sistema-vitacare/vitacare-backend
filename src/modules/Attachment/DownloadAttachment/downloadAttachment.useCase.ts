import { Injectable, Logger, StreamableFile } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { readsAnnulledFollowUps } from '@/modules/FollowUp/policies/followUpVisibility.policy';
import { patientScope } from '@/modules/Patient/policies/patient.policy';
import { FileStorageService } from '@/storage/fileStorage.service';

import { AttachmentErrors } from '../attachment.errors';
import { contentDisposition } from '../policies/attachmentContent.policy';
import { AttachmentRepository } from '../repositories/attachment.repository';

/**
 * Download pela API (proxy), reautorizado a cada chamada pelo alcance de
 * pacientes da sessao: vinculo revogado vale na requisicao seguinte. O volume
 * nunca e servido direto.
 */
@Injectable()
export class DownloadAttachmentUseCase {
  private readonly logger = new Logger(DownloadAttachmentUseCase.name);

  constructor(
    private readonly attachments: AttachmentRepository,
    private readonly storage: FileStorageService,
  ) {}

  async execute(
    followUpId: string,
    attachmentId: string,
    ctx: RequestContext,
  ): Promise<StreamableFile> {
    const attachment = await this.attachments.findForDownload(
      patientScope(ctx),
      followUpId,
      attachmentId,
      readsAnnulledFollowUps(ctx),
    );

    if (!attachment) {
      throw new DomainException({
        ...AttachmentErrors.NOT_FOUND,
        detail:
          'Anexo inexistente, removido, de paciente fora do alcance ou de registro anulado (familiar).',
      });
    }

    const file = await this.storage.open(attachment.storageKey);

    if (!file) {
      this.logger.error(
        `Arquivo do anexo ${attachment.id} ausente no armazenamento.`,
      );
      throw new DomainException({
        ...AttachmentErrors.CONTENT_MISSING,
        detail: 'O registro do anexo existe, mas o arquivo nao foi encontrado.',
      });
    }

    return new StreamableFile(file.stream, {
      type: attachment.contentType,
      length: file.size,
      disposition: contentDisposition(attachment.fileName),
    });
  }
}
