import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

import type { Response } from 'express';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import { UuidParam } from '@/common/http/uuidParam.pipe';
import { Permissions } from '@/modules/Access/access.permissions';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '@/modules/Auth/guards/requiredPermissions.decorator';

import { DownloadAttachmentUseCase } from './DownloadAttachment/downloadAttachment.useCase';
import { AttachmentDto } from './dtos/attachment.dto';
import {
  AttachmentUploadInterceptor,
  UploadedAttachment,
} from './http/attachmentUpload.interceptor';
import { ListAttachmentsUseCase } from './ListAttachments/listAttachments.useCase';
import { RemoveAttachmentUseCase } from './RemoveAttachment/removeAttachment.useCase';
import { ATTACHMENT_CONTENT_TYPES } from './types/attachment.types';
import type { UploadedTempFile } from './types/attachment.types';
import { UploadAttachmentUseCase } from './UploadAttachment/uploadAttachment.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };

@ApiTags('follow-up-attachments')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('follow-ups/:followUpId/attachments')
export class AttachmentController {
  constructor(
    private readonly uploadAttachment: UploadAttachmentUseCase,
    private readonly listAttachments: ListAttachmentsUseCase,
    private readonly downloadAttachment: DownloadAttachmentUseCase,
    private readonly removeAttachment: RemoveAttachmentUseCase,
  ) {}

  @Post()
  @RequirePermissions(Permissions.FOLLOW_UPS_CREATE)
  @UseInterceptors(AttachmentUploadInterceptor)
  @ApiOperation({
    summary:
      'Anexa um arquivo (JPEG, PNG, WEBP ou PDF, ate 10 MB) a um registro de acompanhamento; so o cuidador autor, ate 5 anexos por registro.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Unica parte do corpo. O tipo e conferido pelo conteudo, nao pela extensao.',
        },
      },
    },
  })
  @ApiEnvelope(AttachmentDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    UNAUTHENTICATED,
    { status: 403, codes: ['AUTH_FORBIDDEN', 'ATTACHMENT_NOT_AUTHOR'] },
    { status: 404, codes: ['FOLLOW_UP_NOT_FOUND'] },
    {
      status: 409,
      codes: [
        'ATTACHMENT_FOLLOW_UP_ANNULLED',
        'ATTACHMENT_PATIENT_INACTIVE',
        'ATTACHMENT_LIMIT_REACHED',
      ],
    },
    { status: 413, codes: ['ATTACHMENT_TOO_LARGE'] },
    { status: 415, codes: ['ATTACHMENT_UNSUPPORTED_TYPE'] },
    {
      status: 422,
      codes: [
        'VALIDATION_FAILED',
        'ATTACHMENT_FILE_REQUIRED',
        'ATTACHMENT_EMPTY',
      ],
    },
  )
  async upload(
    @Param('followUpId', UuidParam('followUpId')) followUpId: string,
    @UploadedAttachment() file: UploadedTempFile | undefined,
    @CurrentContext() ctx: RequestContext,
  ): Promise<AttachmentDto> {
    return this.uploadAttachment.execute(followUpId, file, ctx);
  }

  @Get()
  @RequirePermissions(Permissions.PATIENT_HISTORY_READ)
  @ApiOperation({
    summary:
      'Lista os anexos ativos de um registro ao alcance da sessao, do mais antigo para o mais recente.',
  })
  @ApiEnvelope(AttachmentDto, { isArray: true })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['FOLLOW_UP_NOT_FOUND'] },
    VALIDATION,
  )
  async list(
    @Param('followUpId', UuidParam('followUpId')) followUpId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<AttachmentDto[]> {
    return this.listAttachments.execute(followUpId, ctx);
  }

  @Get(':attachmentId/content')
  @RequirePermissions(Permissions.PATIENT_HISTORY_READ)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Baixa o arquivo do anexo (binario, fora do envelope), reautorizado a cada chamada.',
  })
  @ApiProduces(...ATTACHMENT_CONTENT_TYPES, 'application/json')
  @ApiOkResponse({
    description:
      'Conteudo do arquivo, com Content-Type do tipo detectado e Content-Disposition attachment. Erros saem em JSON.',
    content: Object.fromEntries(
      ATTACHMENT_CONTENT_TYPES.map((type) => [
        type,
        { schema: { type: 'string', format: 'binary' } },
      ]),
    ),
  })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    {
      status: 404,
      codes: ['ATTACHMENT_NOT_FOUND', 'ATTACHMENT_CONTENT_MISSING'],
    },
    VALIDATION,
  )
  async download(
    @Param('followUpId', UuidParam('followUpId')) followUpId: string,
    @Param('attachmentId', UuidParam('attachmentId')) attachmentId: string,
    @CurrentContext() ctx: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.downloadAttachment.execute(
      followUpId,
      attachmentId,
      ctx,
    );

    // O Nest so faz `pipe`: sem isto, cliente que aborta deixa o arquivo aberto.
    response.once('close', () => file.getStream().destroy());

    return file;
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAnyPermission(
    Permissions.FOLLOW_UPS_ANNUL,
    Permissions.FOLLOW_UPS_CREATE,
  )
  @ApiOperation({
    summary:
      'Remove um anexo e apaga o arquivo. Admin e profissional removem qualquer um; o cuidador, so os que enviou.',
  })
  @ApiNoContentResponse({ description: 'Anexo removido; sem corpo.' })
  @ApiErrors(
    UNAUTHENTICATED,
    { status: 403, codes: ['AUTH_FORBIDDEN', 'ATTACHMENT_NOT_AUTHOR'] },
    { status: 404, codes: ['ATTACHMENT_NOT_FOUND'] },
    VALIDATION,
  )
  async remove(
    @Param('followUpId', UuidParam('followUpId')) followUpId: string,
    @Param('attachmentId', UuidParam('attachmentId')) attachmentId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<void> {
    await this.removeAttachment.execute(followUpId, attachmentId, ctx);
  }
}
