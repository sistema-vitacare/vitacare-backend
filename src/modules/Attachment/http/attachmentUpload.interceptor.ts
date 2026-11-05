import {
  type CallHandler,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
  PayloadTooLargeException,
  BadRequestException,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { open } from 'node:fs/promises';
import {
  catchError,
  concatMap,
  defer,
  from,
  type Observable,
  switchMap,
  throwError,
} from 'rxjs';

import { DomainException } from '@/common/errors/domain.exception';
import { FileStorageService } from '@/storage/fileStorage.service';

import { AttachmentErrors } from '../attachment.errors';
import { ATTACHMENT_SIGNATURE_BYTES } from '../policies/attachmentContent.policy';
import {
  ATTACHMENT_MAX_BYTES,
  type UploadedTempFile,
} from '../types/attachment.types';

const FIELD = 'file';

interface UploadRequest extends Request {
  file?: { path: string; originalname: string; size: number };
  attachmentFile?: UploadedTempFile;
}

const readHead = async (path: string): Promise<Buffer> => {
  const handle = await open(path, 'r');

  try {
    const head = Buffer.alloc(ATTACHMENT_SIGNATURE_BYTES);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);

    return head.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

/**
 * Recebe um unico arquivo na parte `file`, direto em disco no diretorio de
 * temporarios do volume (o container tem pouca memoria), e traduz os limites
 * do multer para o catalogo do modulo. Roda depois dos guards: sem sessao ou
 * permissao, nada e gravado. O temporario e apagado ao fim da requisicao; o
 * aprovado ja foi movido para a chave final e nao e afetado.
 */
@Injectable()
export class AttachmentUploadInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AttachmentUploadInterceptor.name);
  private readonly multer: NestInterceptor;

  constructor(private readonly storage: FileStorageService) {
    const Multer: Type<NestInterceptor> = FileInterceptor(FIELD, {
      dest: storage.tempDir,
      limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1, fields: 0, parts: 1 },
    });

    this.multer = new Multer();
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<UploadRequest>();
    // A limpeza termina antes da resposta sair, com sucesso ou erro.
    const handler: CallHandler = {
      handle: () =>
        defer(() => from(this.describe(request))).pipe(
          switchMap(() => next.handle()),
          concatMap(async (value: unknown) => {
            await this.cleanUp(request);
            return value;
          }),
          catchError((error: unknown) =>
            from(this.cleanUp(request)).pipe(
              switchMap(() => throwError(() => error)),
            ),
          ),
        ),
    };

    try {
      return await this.multer.intercept(context, handler);
    } catch (error) {
      await this.cleanUp(request);
      throw this.translate(error);
    }
  }

  private async describe(request: UploadRequest): Promise<void> {
    if (!request.file) return;

    request.attachmentFile = {
      path: request.file.path,
      originalName: request.file.originalname,
      size: request.file.size,
      head: await readHead(request.file.path),
    };
  }

  private async cleanUp(request: UploadRequest): Promise<void> {
    if (!request.file) return;

    await this.storage.discard(request.file.path).catch((error: Error) => {
      this.logger.warn(`Temporario de upload nao apagado: ${error.message}`);
    });
  }

  /**
   * O Nest so traduz erros do multer pela mensagem, que mudou no multer 2;
   * por isso o `MulterError` cru tambem e reconhecido pelo `code`.
   */
  private translate(error: unknown): unknown {
    const multerCode =
      (error as { name?: string }).name === 'MulterError'
        ? (error as { code?: string }).code
        : undefined;

    if (
      error instanceof PayloadTooLargeException ||
      multerCode === 'LIMIT_FILE_SIZE'
    ) {
      return new DomainException({
        ...AttachmentErrors.TOO_LARGE,
        detail: `Limite de ${ATTACHMENT_MAX_BYTES} bytes por arquivo.`,
      });
    }
    if (error instanceof BadRequestException || multerCode) {
      return new DomainException({
        ...AttachmentErrors.FILE_REQUIRED,
        detail:
          'O corpo deve ser multipart/form-data com uma unica parte de arquivo `file` e nenhum outro campo.',
      });
    }

    return error;
  }
}

/** Arquivo recebido pelo `AttachmentUploadInterceptor`, se houver. */
export const UploadedAttachment = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UploadedTempFile | undefined =>
    context.switchToHttp().getRequest<UploadRequest>().attachmentFile,
);
