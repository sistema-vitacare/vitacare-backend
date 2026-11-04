import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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

import { ApprovePlanChangeRequestDto } from './ApprovePlanChangeRequest/approvePlanChangeRequest.dto';
import { ApprovePlanChangeRequestUseCase } from './ApprovePlanChangeRequest/approvePlanChangeRequest.useCase';
import { AssignOrganizationPlanDto } from './AssignOrganizationPlan/assignOrganizationPlan.dto';
import { AssignOrganizationPlanUseCase } from './AssignOrganizationPlan/assignOrganizationPlan.useCase';
import { CancelPlanChangeRequestUseCase } from './CancelPlanChangeRequest/cancelPlanChangeRequest.useCase';
import { CreatePlanChangeRequestDto } from './CreatePlanChangeRequest/createPlanChangeRequest.dto';
import { CreatePlanChangeRequestUseCase } from './CreatePlanChangeRequest/createPlanChangeRequest.useCase';
import {
  OrganizationPlanDto,
  PlanChangeRequestDto,
  PlanDto,
} from './dtos/plan.dto';
import { GetOrganizationPlanUseCase } from './GetOrganizationPlan/getOrganizationPlan.useCase';
import { ListPlanChangeRequestsQueryDto } from './ListPlanChangeRequests/listPlanChangeRequests.dto';
import { ListPlanChangeRequestsUseCase } from './ListPlanChangeRequests/listPlanChangeRequests.useCase';
import { ListPlansUseCase } from './ListPlans/listPlans.useCase';
import { RejectPlanChangeRequestDto } from './RejectPlanChangeRequest/rejectPlanChangeRequest.dto';
import { RejectPlanChangeRequestUseCase } from './RejectPlanChangeRequest/rejectPlanChangeRequest.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };
const ORGANIZATION_NOT_FOUND = {
  status: 404,
  codes: ['ORGANIZATION_NOT_FOUND'],
};
const REQUEST_NOT_FOUND = {
  status: 404,
  codes: ['PLAN_CHANGE_REQUEST_NOT_FOUND'],
};
const NOT_PENDING = { status: 409, codes: ['PLAN_CHANGE_REQUEST_NOT_PENDING'] };

/**
 * UC04/RF018. O administrador consulta e pede; o master da plataforma
 * atribui, renova e decide. Rotas `me` vem antes de `:organizationId`.
 */
@ApiTags('plans')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller()
export class PlanController {
  constructor(
    private readonly listPlans: ListPlansUseCase,
    private readonly getOrganizationPlan: GetOrganizationPlanUseCase,
    private readonly assignOrganizationPlan: AssignOrganizationPlanUseCase,
    private readonly createRequest: CreatePlanChangeRequestUseCase,
    private readonly listRequests: ListPlanChangeRequestsUseCase,
    private readonly cancelRequest: CancelPlanChangeRequestUseCase,
    private readonly approveRequest: ApprovePlanChangeRequestUseCase,
    private readonly rejectRequest: RejectPlanChangeRequestUseCase,
  ) {}

  @Get('plans')
  @RequireAnyPermission(
    Permissions.PLAN_READ,
    Permissions.PLATFORM_ORGANIZATIONS_READ,
  )
  @ApiOperation({ summary: 'Lista o catalogo de planos ativos.' })
  @ApiEnvelope(PlanDto, { isArray: true })
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN)
  async catalog(): Promise<PlanDto[]> {
    return this.listPlans.execute();
  }

  @Get('organizations/me/plan')
  @RequirePermissions(Permissions.PLAN_READ)
  @ApiOperation({
    summary:
      'Consulta plano, vigencia, limites e uso da organizacao da sessao.',
  })
  @ApiEnvelope(OrganizationPlanDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, ORGANIZATION_NOT_FOUND)
  async getOwn(
    @CurrentContext() ctx: RequestContext,
  ): Promise<OrganizationPlanDto> {
    return this.getOrganizationPlan.execute(ctx.organizationId, ctx);
  }

  @Get('organizations/:organizationId/plan')
  @RequirePermissions(Permissions.PLATFORM_ORGANIZATIONS_READ)
  @ApiOperation({
    summary: 'Consulta o plano de qualquer organizacao cliente.',
  })
  @ApiEnvelope(OrganizationPlanDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, ORGANIZATION_NOT_FOUND, VALIDATION)
  async get(
    @Param('organizationId', UuidParam('organizationId'))
    organizationId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<OrganizationPlanDto> {
    return this.getOrganizationPlan.execute(organizationId, ctx);
  }

  @Put('organizations/:organizationId/plan')
  @RequirePermissions(Permissions.PLATFORM_ORGANIZATIONS_UPDATE)
  @ApiOperation({
    summary:
      'Atribui, troca, renova ou personaliza o plano de uma organizacao cliente.',
  })
  @ApiEnvelope(OrganizationPlanDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, ORGANIZATION_NOT_FOUND, {
    status: 422,
    codes: ['VALIDATION_FAILED', 'PLAN_NOT_FOUND', 'PLAN_TERM_END_IN_PAST'],
  })
  async assign(
    @Param('organizationId', UuidParam('organizationId'))
    organizationId: string,
    @Body() body: AssignOrganizationPlanDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<OrganizationPlanDto> {
    return this.assignOrganizationPlan.execute(organizationId, body, ctx);
  }

  @Post('plan-change-requests')
  @RequirePermissions(Permissions.PLAN_CHANGE_REQUESTS_CREATE)
  @ApiOperation({ summary: 'Registra uma solicitacao de mudanca de plano.' })
  @ApiEnvelope(PlanChangeRequestDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 409, codes: ['PLAN_CHANGE_REQUEST_ALREADY_PENDING'] },
    {
      status: 422,
      codes: ['VALIDATION_FAILED', 'PLAN_NOT_FOUND', 'PLAN_CHANGE_SAME_PLAN'],
    },
  )
  async create(
    @Body() body: CreatePlanChangeRequestDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PlanChangeRequestDto> {
    return this.createRequest.execute(body, ctx);
  }

  @Get('plan-change-requests')
  @RequireAnyPermission(
    Permissions.PLAN_READ,
    Permissions.PLATFORM_ORGANIZATIONS_READ,
  )
  @ApiOperation({
    summary:
      'Lista solicitacoes de mudanca de plano: as da organizacao da sessao ou, na plataforma, todas.',
  })
  @ApiEnvelope(PlanChangeRequestDto, { isArray: true })
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, VALIDATION)
  async list(
    @Query() query: ListPlanChangeRequestsQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<PlanChangeRequestDto[]>> {
    return this.listRequests.execute(query, ctx);
  }

  @Post('plan-change-requests/:requestId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.PLAN_CHANGE_REQUESTS_CREATE)
  @ApiOperation({ summary: 'Cancela a solicitacao pendente da organizacao.' })
  @ApiEnvelope(PlanChangeRequestDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    REQUEST_NOT_FOUND,
    NOT_PENDING,
    VALIDATION,
  )
  async cancel(
    @Param('requestId', UuidParam('requestId')) requestId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PlanChangeRequestDto> {
    return this.cancelRequest.execute(requestId, ctx);
  }

  @Post('plan-change-requests/:requestId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.PLATFORM_ORGANIZATIONS_UPDATE)
  @ApiOperation({
    summary: 'Aprova a solicitacao e aplica o plano pedido num termo novo.',
  })
  @ApiEnvelope(PlanChangeRequestDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, REQUEST_NOT_FOUND, NOT_PENDING, {
    status: 422,
    codes: ['VALIDATION_FAILED', 'PLAN_NOT_FOUND', 'PLAN_TERM_END_IN_PAST'],
  })
  async approve(
    @Param('requestId', UuidParam('requestId')) requestId: string,
    @Body() body: ApprovePlanChangeRequestDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PlanChangeRequestDto> {
    return this.approveRequest.execute(requestId, body, ctx);
  }

  @Post('plan-change-requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.PLATFORM_ORGANIZATIONS_UPDATE)
  @ApiOperation({ summary: 'Recusa a solicitacao com justificativa.' })
  @ApiEnvelope(PlanChangeRequestDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    REQUEST_NOT_FOUND,
    NOT_PENDING,
    VALIDATION,
  )
  async reject(
    @Param('requestId', UuidParam('requestId')) requestId: string,
    @Body() body: RejectPlanChangeRequestDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PlanChangeRequestDto> {
    return this.rejectRequest.execute(requestId, body, ctx);
  }
}
