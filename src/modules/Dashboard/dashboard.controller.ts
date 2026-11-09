import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import type { EnvelopePayload } from '@/common/http/envelope';
import { Permissions } from '@/modules/Access/access.permissions';
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import { DashboardPeriodQueryDto } from './dtos/dashboard.dto';
import { DashboardDto } from './GetDashboard/getDashboard.dto';
import { GetDashboardUseCase } from './GetDashboard/getDashboard.useCase';
import { DashboardAlertsDto } from './GetDashboardAlerts/getDashboardAlerts.dto';
import { GetDashboardAlertsUseCase } from './GetDashboardAlerts/getDashboardAlerts.useCase';
import { DashboardFollowUpsDto } from './GetDashboardFollowUps/getDashboardFollowUps.dto';
import { GetDashboardFollowUpsUseCase } from './GetDashboardFollowUps/getDashboardFollowUps.useCase';
import { DashboardPatientsDto } from './GetDashboardPatients/getDashboardPatients.dto';
import { GetDashboardPatientsUseCase } from './GetDashboardPatients/getDashboardPatients.useCase';
import { DashboardUsersDto } from './GetDashboardUsers/getDashboardUsers.dto';
import { GetDashboardUsersUseCase } from './GetDashboardUsers/getDashboardUsers.useCase';

/** 500 e o fluxo alternativo "falha ao carregar": a nova tentativa e repetir a chamada. */
const AUTH_ERRORS = [
  { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
  {
    status: 403,
    codes: ['AUTH_FORBIDDEN', 'DASHBOARD_PLAN_FEATURE_UNAVAILABLE'],
  },
  { status: 500, codes: ['INTERNAL_ERROR'] },
];

const PERIOD_ERRORS = [
  ...AUTH_ERRORS,
  { status: 422, codes: ['VALIDATION_FAILED'] },
];

/** Painel operacional da organizacao (RF015, UC05, Figura 33). So admin e plano Enterprise. */
@ApiTags('dashboard')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('dashboard')
@RequirePermissions(Permissions.DASHBOARD_READ)
export class DashboardController {
  constructor(
    private readonly getDashboard: GetDashboardUseCase,
    private readonly getPatients: GetDashboardPatientsUseCase,
    private readonly getUsers: GetDashboardUsersUseCase,
    private readonly getFollowUps: GetDashboardFollowUpsUseCase,
    private readonly getAlerts: GetDashboardAlertsUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Painel operacional: pacientes e usuarios ativos, registros e alertas emitidos no periodo com o periodo anterior, alertas pendentes, alertas prioritarios e ultimos registros (UC05 passos 1-3).',
  })
  @ApiEnvelope(DashboardDto)
  @ApiErrors(...PERIOD_ERRORS)
  summary(
    @Query() query: DashboardPeriodQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<DashboardDto>> {
    return this.getDashboard.execute(query, ctx);
  }

  @Get('patients')
  @ApiOperation({
    summary:
      'Detalhe do indicador de pacientes: ativos e inativos agora, novos no periodo e ativos por profissional responsavel (UC05 passo 4).',
  })
  @ApiEnvelope(DashboardPatientsDto)
  @ApiErrors(...PERIOD_ERRORS)
  patients(
    @Query() query: DashboardPeriodQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<DashboardPatientsDto> {
    return this.getPatients.execute(query, ctx);
  }

  @Get('users')
  @ApiOperation({
    summary:
      'Detalhe do indicador de usuarios: ativos, convidados e inativos agora, por perfil (UC05 passo 4).',
  })
  @ApiEnvelope(DashboardUsersDto)
  @ApiErrors(...AUTH_ERRORS)
  users(@CurrentContext() ctx: RequestContext): Promise<DashboardUsersDto> {
    return this.getUsers.execute(ctx);
  }

  @Get('follow-ups')
  @ApiOperation({
    summary:
      'Detalhe do indicador de registros: validos no periodo por dia, por formulario e por autor, com o periodo anterior (UC05 passo 4).',
  })
  @ApiEnvelope(DashboardFollowUpsDto)
  @ApiErrors(...PERIOD_ERRORS)
  followUps(
    @Query() query: DashboardPeriodQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<DashboardFollowUpsDto>> {
    return this.getFollowUps.execute(query, ctx);
  }

  @Get('alerts')
  @ApiOperation({
    summary:
      'Detalhe do indicador de alertas: emitidos no periodo por dia, severidade e origem, e pendentes agora (UC05 passo 4).',
  })
  @ApiEnvelope(DashboardAlertsDto)
  @ApiErrors(...PERIOD_ERRORS)
  alerts(
    @Query() query: DashboardPeriodQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<DashboardAlertsDto>> {
    return this.getAlerts.execute(query, ctx);
  }
}
