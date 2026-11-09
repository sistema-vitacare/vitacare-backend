import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import type { EnvelopePayload } from '@/common/http/envelope';
import { UuidParam } from '@/common/http/uuidParam.pipe';
import { Permissions } from '@/modules/Access/access.permissions';
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import {
  AuditActionDto,
  AuditEventDetailDto,
  AuditEventDto,
  AuditEventFilterQueryDto,
  ListAuditEventsQueryDto,
} from './dtos/auditEvent.dto';
import { ExportAuditEventsUseCase } from './ExportAuditEvents/exportAuditEvents.useCase';
import { GetAuditEventUseCase } from './GetAuditEvent/getAuditEvent.useCase';
import { ListAuditActionsUseCase } from './ListAuditActions/listAuditActions.useCase';
import { ListAuditEventsUseCase } from './ListAuditEvents/listAuditEvents.useCase';
import { AUDIT_EXPORT_MAX_EVENTS } from './types/auditEvent.types';

const AUTH_ERRORS = [
  { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
  { status: 403, codes: ['AUTH_FORBIDDEN'] },
];

/**
 * Auditoria das acoes (RF017, UC06, Figura 45). O admin consulta a propria
 * organizacao; o master, todas. Nenhuma rota altera ou apaga eventos.
 */
@ApiTags('audit')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('audit-events')
export class AuditController {
  constructor(
    private readonly listEvents: ListAuditEventsUseCase,
    private readonly getEvent: GetAuditEventUseCase,
    private readonly listActions: ListAuditActionsUseCase,
    private readonly exportEvents: ExportAuditEventsUseCase,
  ) {}

  @Get()
  @RequirePermissions(Permissions.AUDIT_EVENTS_READ)
  @ApiOperation({
    summary:
      'Lista eventos de auditoria por periodo, acao, usuario, sistema, gravidade e busca, do mais recente ao mais antigo (UC06 passos 2-4).',
  })
  @ApiEnvelope(AuditEventDto, { isArray: true })
  @ApiErrors(...AUTH_ERRORS, { status: 422, codes: ['VALIDATION_FAILED'] })
  list(
    @Query() query: ListAuditEventsQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<AuditEventDto[]>> {
    return this.listEvents.execute(query, ctx);
  }

  @Get('actions')
  @RequirePermissions(Permissions.AUDIT_EVENTS_READ)
  @ApiOperation({
    summary:
      'Catalogo de acoes auditadas, com rotulo e gravidade, para o filtro "Acao".',
  })
  @ApiEnvelope(AuditActionDto, { isArray: true })
  @ApiErrors(...AUTH_ERRORS)
  actions(): AuditActionDto[] {
    return this.listActions.execute();
  }

  @Get('export')
  @RequirePermissions(Permissions.AUDIT_EVENTS_EXPORT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Exporta em CSV (binario, fora do envelope) os eventos dos mesmos filtros da lista, gerado na hora, sem guardar arquivo, e registrado na auditoria (UC06 passo 5).',
  })
  @ApiProduces('text/csv', 'application/json')
  @ApiOkResponse({
    description: `CSV UTF-8 com BOM, separador ";", Content-Disposition attachment; ate ${AUDIT_EXPORT_MAX_EVENTS} eventos. Erros saem em JSON; em falha na geracao, repetir o pedido.`,
    content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiErrors(
    ...AUTH_ERRORS,
    {
      status: 422,
      codes: ['VALIDATION_FAILED', 'AUDIT_EXPORT_TOO_MANY_EVENTS'],
    },
    { status: 500, codes: ['AUDIT_EXPORT_FAILED'] },
  )
  export(
    @Query() query: AuditEventFilterQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<StreamableFile> {
    return this.exportEvents.execute(query, ctx);
  }

  @Get(':eventId')
  @RequirePermissions(Permissions.AUDIT_EVENTS_READ)
  @ApiOperation({
    summary:
      'Detalhe de um evento, com os valores anterior e novo gravados (UC06 passo 5).',
  })
  @ApiEnvelope(AuditEventDetailDto)
  @ApiErrors(
    ...AUTH_ERRORS,
    { status: 404, codes: ['AUDIT_EVENT_NOT_FOUND'] },
    { status: 422, codes: ['VALIDATION_FAILED'] },
  )
  detail(
    @Param('eventId', UuidParam('eventId')) eventId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<AuditEventDetailDto> {
    return this.getEvent.execute(eventId, ctx);
  }
}
