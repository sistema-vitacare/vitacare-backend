import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import type { EnvelopePayload } from '@/common/http/envelope';
import { UuidParam } from '@/common/http/uuidParam.pipe';
import { Permissions } from '@/modules/Access/access.permissions';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '@/modules/Auth/guards/requiredPermissions.decorator';

import { AnnulFollowUpDto } from './AnnulFollowUp/annulFollowUp.dto';
import { AnnulFollowUpUseCase } from './AnnulFollowUp/annulFollowUp.useCase';
import { CreateFollowUpDto } from './CreateFollowUp/createFollowUp.dto';
import { CreateFollowUpUseCase } from './CreateFollowUp/createFollowUp.useCase';
import { FollowUpDto } from './dtos/followUp.dto';
import { GetFollowUpUseCase } from './GetFollowUp/getFollowUp.useCase';
import { ListFollowUpsQueryDto } from './ListFollowUps/listFollowUps.dto';
import { ListFollowUpsUseCase } from './ListFollowUps/listFollowUps.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };

@ApiTags('follow-ups')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('follow-ups')
export class FollowUpController {
  constructor(
    private readonly createFollowUp: CreateFollowUpUseCase,
    private readonly listFollowUps: ListFollowUpsUseCase,
    private readonly getFollowUp: GetFollowUpUseCase,
    private readonly annulFollowUp: AnnulFollowUpUseCase,
  ) {}

  @Post()
  @RequirePermissions(Permissions.FOLLOW_UPS_CREATE)
  @ApiOperation({
    summary:
      'Registra o acompanhamento de um paciente vinculado: registro, resposta e itens numa transacao (UC11).',
  })
  @ApiEnvelope(FollowUpDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['PATIENT_NOT_FOUND', 'FORM_NOT_FOUND'] },
    {
      status: 409,
      codes: [
        'FOLLOW_UP_PATIENT_INACTIVE',
        'FORM_INACTIVE',
        'FOLLOW_UP_FORM_VERSION_OUTDATED',
      ],
    },
    {
      status: 422,
      codes: [
        'VALIDATION_FAILED',
        'FOLLOW_UP_FORM_NOT_APPLICABLE',
        'FOLLOW_UP_EMPTY',
        'FOLLOW_UP_INVALID_ANSWERS',
        'FOLLOW_UP_INVALID_VISITED_AT',
      ],
    },
  )
  async create(
    @Body() body: CreateFollowUpDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<FollowUpDto> {
    return this.createFollowUp.execute(body, ctx);
  }

  @Get()
  @RequirePermissions(Permissions.PATIENT_HISTORY_READ)
  @ApiOperation({
    summary:
      'Lista os registros de acompanhamento de um paciente ao alcance da sessao, da visita mais recente para a mais antiga.',
  })
  @ApiEnvelope(FollowUpDto, {
    isArray: true,
    description:
      'Lista vazia traz `meta.message` "Nenhum registro de acompanhamento no período e nos filtros selecionados." (UC12/UC14 alternativos).',
  })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['PATIENT_NOT_FOUND'] },
    VALIDATION,
  )
  async list(
    @Query() query: ListFollowUpsQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<FollowUpDto[]>> {
    return this.listFollowUps.execute(query, ctx);
  }

  @Get(':followUpId')
  @RequirePermissions(Permissions.PATIENT_HISTORY_READ)
  @ApiOperation({
    summary:
      'Consulta um registro de acompanhamento com as respostas e os campos da versao respondida.',
  })
  @ApiEnvelope(FollowUpDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['FOLLOW_UP_NOT_FOUND'] },
    VALIDATION,
  )
  async get(
    @Param('followUpId', UuidParam('followUpId')) followUpId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<FollowUpDto> {
    return this.getFollowUp.execute(followUpId, ctx);
  }

  @Post(':followUpId/annul')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission(
    Permissions.FOLLOW_UPS_ANNUL,
    Permissions.FOLLOW_UPS_CREATE,
  )
  @ApiOperation({
    summary:
      'Anula um registro com motivo; ele continua no historico marcado como anulado. Admin e profissional anulam qualquer um; o cuidador, so os proprios.',
  })
  @ApiEnvelope(FollowUpDto)
  @ApiErrors(
    UNAUTHENTICATED,
    { status: 403, codes: ['AUTH_FORBIDDEN', 'FOLLOW_UP_NOT_AUTHOR'] },
    { status: 404, codes: ['FOLLOW_UP_NOT_FOUND'] },
    { status: 409, codes: ['FOLLOW_UP_ALREADY_ANNULLED'] },
    VALIDATION,
  )
  async annul(
    @Param('followUpId', UuidParam('followUpId')) followUpId: string,
    @Body() body: AnnulFollowUpDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<FollowUpDto> {
    return this.annulFollowUp.execute(followUpId, body, ctx);
  }
}
