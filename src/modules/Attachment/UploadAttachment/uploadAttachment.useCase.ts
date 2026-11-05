import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { FollowUpErrors } from '@/modules/FollowUp/followUp.errors';
import { patientScope } from '@/modules/Patient/policies/patient.policy';
import { FileStorageService } from '@/storage/fileStorage.service';

import { AttachmentErrors } from '../attachment.errors';
import type { AttachmentDto } from '../dtos/attachment.dto';
import { toAttachmentResponse } from '../parsers/attachment.parser';
import {
  detectAttachmentType,
  sanitizeFileName,
} from '../policies/attachmentContent.policy';
import { AttachmentRepository } from '../repositories/attachment.repository';
import type { UploadedTempFile } from '../types/attachment.types';

/**
 * Anexo enviado pelo cuidador autor depois do registro (decisao de Mateus,
 * 2026-11-05). O conteudo e validado antes de tocar banco ou volume; o arquivo
 * so chega a chave final com todas as checagens aprovadas, dentro da
 * transacao. Se a transacao falhar depois disso, o arquivo e apagado: nao fica
 * arquivo com linha desfeita, e um arquivo sem linha e inacessivel.
 */
@Injectable()
export class UploadAttachmentUseCase {
  private readonly logger = new Logger(UploadAttachmentUseCase.name);

  constructor(
    private readonly attachments: AttachmentRepository,
    private readonly storage: FileStorageService,
  ) {}

  async execute(
    followUpId: string,
    file: UploadedTempFile | undefined,
    ctx: RequestContext,
  ): Promise<AttachmentDto> {
    if (!file) {
      throw new DomainException({
        ...AttachmentErrors.FILE_REQUIRED,
        detail: 'Nenhuma parte de arquivo `file` na requisicao.',
      });
    }
    if (file.size === 0) {
      throw new DomainException({
        ...AttachmentErrors.EMPTY,
        detail: 'Arquivo com 0 byte.',
      });
    }

    const contentType = detectAttachmentType(file.head);

    if (!contentType) {
      throw new DomainException({
        ...AttachmentErrors.UNSUPPORTED_TYPE,
        detail:
          'Assinatura do conteudo nao corresponde a JPEG, PNG, WEBP ou PDF.',
      });
    }

    const attachmentId = randomUUID();
    const storageKey = `attachments/${ctx.organizationId}/${attachmentId}`;
    let stored = false;

    try {
      const outcome = await this.attachments.upload(
        {
          ...patientScope(ctx),
          actorUserId: ctx.userId,
          requestId: ctx.requestId,
          followUpId,
          attachmentId,
          fileName: sanitizeFileName(file.originalName, contentType),
          contentType,
          sizeBytes: file.size,
          storageKey,
        },
        async () => {
          await this.storage.promote(file.path, storageKey);
          stored = true;
        },
      );

      switch (outcome.kind) {
        case 'created':
          return toAttachmentResponse(outcome.attachment, ctx);
        case 'follow_up_not_found':
          throw new DomainException({
            ...FollowUpErrors.NOT_FOUND,
            detail: 'Registro inexistente ou de paciente fora do alcance.',
          });
        case 'not_author':
          throw new DomainException({
            ...AttachmentErrors.NOT_AUTHOR,
            detail: 'So o autor do registro envia anexos.',
          });
        case 'follow_up_annulled':
          throw new DomainException({
            ...AttachmentErrors.FOLLOW_UP_ANNULLED,
            detail: 'Registro anulado nao recebe anexos.',
          });
        case 'patient_inactive':
          throw new DomainException({
            ...AttachmentErrors.PATIENT_INACTIVE,
            detail: 'Paciente inativo nao recebe anexos.',
          });
        case 'limit_reached':
          throw new DomainException({
            ...AttachmentErrors.LIMIT_REACHED,
            detail: 'Limite de anexos ativos por registro atingido.',
          });
      }
    } catch (error) {
      if (stored) await this.compensate(storageKey);
      throw error;
    }
  }

  private async compensate(storageKey: string): Promise<void> {
    try {
      await this.storage.remove(storageKey);
    } catch (error) {
      this.logger.warn(
        `Arquivo orfao (inacessivel) apos falha no envio: ${storageKey} (${(error as Error).message})`,
      );
    }
  }
}
