import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

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
  ListAuditEventsQueryDto,
} from './dtos/auditEvent.dto';
import { GetAuditEventUseCase } from './GetAuditEvent/getAuditEvent.useCase';
import { ListAuditActionsUseCase } from './ListAuditActions/listAuditActions.useCase';
import { ListAuditEventsUseCase } from './ListAuditEvents/listAuditEvents.useCase';

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
