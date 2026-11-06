import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import { CreateAlertRuleDto } from './CreateAlertRule/createAlertRule.dto';
import { CreateAlertRuleUseCase } from './CreateAlertRule/createAlertRule.useCase';
import { DeactivateAlertRuleUseCase } from './DeactivateAlertRule/deactivateAlertRule.useCase';
import { AlertDto } from './dtos/alert.dto';
import { AlertRuleDto } from './dtos/alertRule.dto';
import { GetAlertUseCase } from './GetAlert/getAlert.useCase';
import { GetAlertRuleUseCase } from './GetAlertRule/getAlertRule.useCase';
import { ListAlertRulesQueryDto } from './ListAlertRules/listAlertRules.dto';
import { ListAlertRulesUseCase } from './ListAlertRules/listAlertRules.useCase';
import { ListAlertsQueryDto } from './ListAlerts/listAlerts.dto';
import { ListAlertsUseCase } from './ListAlerts/listAlerts.useCase';
import { ReactivateAlertRuleUseCase } from './ReactivateAlertRule/reactivateAlertRule.useCase';
import { ResolveAlertUseCase } from './ResolveAlert/resolveAlert.useCase';
import { UpdateAlertRuleDto } from './UpdateAlertRule/updateAlertRule.dto';
import { UpdateAlertRuleUseCase } from './UpdateAlertRule/updateAlertRule.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const RULE_NOT_FOUND = { status: 404, codes: ['ALERT_RULE_NOT_FOUND'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };

@ApiTags('alerts')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller()
export class AlertController {
  constructor(
    private readonly createAlertRule: CreateAlertRuleUseCase,
    private readonly listAlertRules: ListAlertRulesUseCase,
    private readonly getAlertRule: GetAlertRuleUseCase,
    private readonly updateAlertRule: UpdateAlertRuleUseCase,
    private readonly deactivateAlertRule: DeactivateAlertRuleUseCase,
    private readonly reactivateAlertRule: ReactivateAlertRuleUseCase,
    private readonly listAlerts: ListAlertsUseCase,
    private readonly getAlert: GetAlertUseCase,
    private readonly resolveAlert: ResolveAlertUseCase,
  ) {}

  @Post('alert-rules')
  @RequirePermissions(Permissions.ALERT_RULES_MANAGE)
  @ApiOperation({
    summary:
      'Cria uma regra de alerta sobre um campo numerico da versao vigente de um formulario ativo, geral ou de um paciente.',
  })
  @ApiEnvelope(AlertRuleDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['FORM_NOT_FOUND', 'PATIENT_NOT_FOUND'] },
    {
      status: 409,
      codes: ['ALERT_RULE_FORM_INACTIVE', 'ALERT_RULE_PATIENT_INACTIVE'],
    },
    {
      status: 422,
      codes: [
        'VALIDATION_FAILED',
        'ALERT_RULE_FIELD_NOT_FOUND',
        'ALERT_RULE_FIELD_NOT_NUMERIC',
        'ALERT_RULE_FORM_NOT_APPLICABLE',
      ],
    },
  )
  async createRule(
    @Body() body: CreateAlertRuleDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<AlertRuleDto> {
    return this.createAlertRule.execute(body, ctx);
  }

  @Get('alert-rules')
  @RequirePermissions(Permissions.ALERT_RULES_MANAGE)
  @ApiOperation({
    summary:
      'Lista as regras de alerta da organizacao, paginadas; ativas primeiro.',
  })
  @ApiEnvelope(AlertRuleDto, { isArray: true })
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, VALIDATION)
  async listRules(
    @Query() query: ListAlertRulesQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<AlertRuleDto[]>> {
    return this.listAlertRules.execute(query, ctx);
  }

  @Get('alert-rules/:ruleId')
  @RequirePermissions(Permissions.ALERT_RULES_MANAGE)
  @ApiOperation({ summary: 'Consulta uma regra de alerta da organizacao.' })
  @ApiEnvelope(AlertRuleDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, RULE_NOT_FOUND, VALIDATION)
  async getRule(
    @Param('ruleId', UuidParam('ruleId')) ruleId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<AlertRuleDto> {
    return this.getAlertRule.execute(ruleId, ctx);
  }

  @Patch('alert-rules/:ruleId')
  @RequirePermissions(Permissions.ALERT_RULES_MANAGE)
  @ApiOperation({
    summary:
      'Edita nome, descricao, operador, referencia ou severidade de uma regra ativa; vale para os registros seguintes.',
  })
  @ApiEnvelope(AlertRuleDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    RULE_NOT_FOUND,
    { status: 409, codes: ['ALERT_RULE_INACTIVE'] },
    {
      status: 422,
      codes: ['VALIDATION_FAILED', 'ALERT_RULE_NOTHING_TO_UPDATE'],
    },
  )
  async updateRule(
    @Param('ruleId', UuidParam('ruleId')) ruleId: string,
    @Body() body: UpdateAlertRuleDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<AlertRuleDto> {
    return this.updateAlertRule.execute(ruleId, body, ctx);
  }

  @Post('alert-rules/:ruleId/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.ALERT_RULES_MANAGE)
  @ApiOperation({
    summary: 'Inativa a regra; os alertas ja gerados sao preservados.',
  })
  @ApiEnvelope(AlertRuleDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    RULE_NOT_FOUND,
    { status: 409, codes: ['ALERT_RULE_ALREADY_INACTIVE'] },
    VALIDATION,
  )
  async deactivateRule(
    @Param('ruleId', UuidParam('ruleId')) ruleId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<AlertRuleDto> {
    return this.deactivateAlertRule.execute(ruleId, ctx);
  }

  @Post('alert-rules/:ruleId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.ALERT_RULES_MANAGE)
  @ApiOperation({
    summary: 'Reativa a regra para os registros enviados a partir de agora.',
  })
  @ApiEnvelope(AlertRuleDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    RULE_NOT_FOUND,
    { status: 409, codes: ['ALERT_RULE_ALREADY_ACTIVE'] },
    VALIDATION,
  )
  async reactivateRule(
    @Param('ruleId', UuidParam('ruleId')) ruleId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<AlertRuleDto> {
    return this.reactivateAlertRule.execute(ruleId, ctx);
  }

  @Get('alerts')
  @RequirePermissions(Permissions.ALERTS_READ)
  @ApiOperation({
    summary:
      'Lista os alertas de um paciente ao alcance da sessao, paginados; mais recentes primeiro.',
  })
  @ApiEnvelope(AlertDto, { isArray: true })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['PATIENT_NOT_FOUND'] },
    VALIDATION,
  )
  async list(
    @Query() query: ListAlertsQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<AlertDto[]>> {
    return this.listAlerts.execute(query, ctx);
  }

  @Get('alerts/:alertId')
  @RequirePermissions(Permissions.ALERTS_READ)
  @ApiOperation({
    summary: 'Consulta um alerta de paciente ao alcance da sessao.',
  })
  @ApiEnvelope(AlertDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['ALERT_NOT_FOUND'] },
    VALIDATION,
  )
  async get(
    @Param('alertId', UuidParam('alertId')) alertId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<AlertDto> {
    return this.getAlert.execute(alertId, ctx);
  }

  @Post('alerts/:alertId/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.ALERTS_RESOLVE)
  @ApiOperation({
    summary:
      'Resolve o alerta para todos, com autor e data; admin, profissional e cuidador no proprio alcance.',
  })
  @ApiEnvelope(AlertDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['ALERT_NOT_FOUND'] },
    { status: 409, codes: ['ALERT_ALREADY_RESOLVED'] },
    VALIDATION,
  )
  async resolve(
    @Param('alertId', UuidParam('alertId')) alertId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<AlertDto> {
    return this.resolveAlert.execute(alertId, ctx);
  }
}
