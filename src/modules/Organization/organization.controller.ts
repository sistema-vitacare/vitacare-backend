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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

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
  CreateOrganizationDto,
  CreateOrganizationResponseDto,
} from './CreateOrganization/createOrganization.dto';
import { CreateOrganizationUseCase } from './CreateOrganization/createOrganization.useCase';
import { DeactivateOrganizationUseCase } from './DeactivateOrganization/deactivateOrganization.useCase';
import { OrganizationDto } from './dtos/organization.dto';
import { GetOrganizationUseCase } from './GetOrganization/getOrganization.useCase';
import { ListOrganizationsQueryDto } from './ListOrganizations/listOrganizations.dto';
import { ListOrganizationsUseCase } from './ListOrganizations/listOrganizations.useCase';
import { ReactivateOrganizationUseCase } from './ReactivateOrganization/reactivateOrganization.useCase';
import { UpdateOrganizationDto } from './UpdateOrganization/updateOrganization.dto';
import { UpdateOrganizationUseCase } from './UpdateOrganization/updateOrganization.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const NOT_FOUND = { status: 404, codes: ['ORGANIZATION_NOT_FOUND'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };

/** Rotas `me` vem antes de `:organizationId`: o Nest casa na ordem declarada. */
@ApiTags('organizations')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('organizations')
export class OrganizationController {
  constructor(
    private readonly createOrganization: CreateOrganizationUseCase,
    private readonly listOrganizations: ListOrganizationsUseCase,
    private readonly getOrganization: GetOrganizationUseCase,
    private readonly updateOrganization: UpdateOrganizationUseCase,
    private readonly deactivateOrganization: DeactivateOrganizationUseCase,
    private readonly reactivateOrganization: ReactivateOrganizationUseCase,
  ) {}

  @Get('me')
  @RequirePermissions(Permissions.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Consulta a organizacao da sessao.' })
  @ApiEnvelope(OrganizationDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN)
  async getOwn(
    @CurrentContext() ctx: RequestContext,
  ): Promise<OrganizationDto> {
    return this.getOrganization.execute(ctx.organizationId, ctx);
  }

  @Patch('me')
  @RequirePermissions(Permissions.ORGANIZATION_UPDATE)
  @ApiOperation({
    summary: 'Atualiza os dados cadastrais da organizacao da sessao.',
  })
  @ApiEnvelope(OrganizationDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    {
      status: 409,
      codes: ['ORGANIZATION_DOCUMENT_TAKEN'],
    },
    {
      status: 422,
      codes: ['VALIDATION_FAILED', 'ORGANIZATION_NOTHING_TO_UPDATE'],
    },
  )
  async updateOwn(
    @Body() body: UpdateOrganizationDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<OrganizationDto> {
    return this.updateOrganization.execute(ctx.organizationId, body, ctx);
  }

  @Post()
  @RequirePermissions(Permissions.PLATFORM_ORGANIZATIONS_CREATE)
  @ApiOperation({
    summary: 'Cadastra uma organizacao e o seu primeiro administrador.',
  })
  @ApiEnvelope(CreateOrganizationResponseDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    {
      status: 409,
      codes: ['ORGANIZATION_CODE_TAKEN', 'ORGANIZATION_DOCUMENT_TAKEN'],
    },
    {
      status: 422,
      codes: ['VALIDATION_FAILED', 'ORGANIZATION_PLAN_NOT_FOUND'],
    },
  )
  async create(
    @Body() body: CreateOrganizationDto,
    @CurrentContext() ctx: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateOrganizationResponseDto> {
    response.setHeader('Cache-Control', 'no-store');

    return this.createOrganization.execute(body, ctx);
  }

  @Get()
  @RequirePermissions(Permissions.PLATFORM_ORGANIZATIONS_READ)
  @ApiOperation({ summary: 'Lista as organizacoes clientes, paginadas.' })
  @ApiEnvelope(OrganizationDto, { isArray: true })
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, VALIDATION)
  async list(
    @Query() query: ListOrganizationsQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<OrganizationDto[]>> {
    return this.listOrganizations.execute(query, ctx);
  }

  @Get(':organizationId')
  @RequirePermissions(Permissions.PLATFORM_ORGANIZATIONS_READ)
  @ApiOperation({ summary: 'Consulta qualquer organizacao.' })
  @ApiEnvelope(OrganizationDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION)
  async get(
    @Param('organizationId', UuidParam('organizationId'))
    organizationId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<OrganizationDto> {
    return this.getOrganization.execute(organizationId, ctx);
  }

  @Patch(':organizationId')
  @RequirePermissions(Permissions.PLATFORM_ORGANIZATIONS_UPDATE)
  @ApiOperation({
    summary: 'Atualiza os dados cadastrais de qualquer organizacao.',
  })
  @ApiEnvelope(OrganizationDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    {
      status: 409,
      codes: ['ORGANIZATION_DOCUMENT_TAKEN'],
    },
    {
      status: 422,
      codes: ['VALIDATION_FAILED', 'ORGANIZATION_NOTHING_TO_UPDATE'],
    },
  )
  async update(
    @Param('organizationId', UuidParam('organizationId'))
    organizationId: string,
    @Body() body: UpdateOrganizationDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<OrganizationDto> {
    return this.updateOrganization.execute(organizationId, body, ctx);
  }

  @Post(':organizationId/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.PLATFORM_ORGANIZATIONS_CHANGE_STATUS)
  @ApiOperation({
    summary: 'Inativa a organizacao e revoga as sessoes dos seus usuarios.',
  })
  @ApiEnvelope(OrganizationDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    {
      status: 409,
      codes: [
        'ORGANIZATION_ALREADY_INACTIVE',
        'ORGANIZATION_PLATFORM_PROTECTED',
      ],
    },
    VALIDATION,
  )
  async deactivate(
    @Param('organizationId', UuidParam('organizationId'))
    organizationId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<OrganizationDto> {
    return this.deactivateOrganization.execute(organizationId, ctx);
  }

  @Post(':organizationId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.PLATFORM_ORGANIZATIONS_CHANGE_STATUS)
  @ApiOperation({ summary: 'Reativa uma organizacao inativa.' })
  @ApiEnvelope(OrganizationDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    {
      status: 409,
      codes: ['ORGANIZATION_ALREADY_ACTIVE'],
    },
    VALIDATION,
  )
  async reactivate(
    @Param('organizationId', UuidParam('organizationId'))
    organizationId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<OrganizationDto> {
    return this.reactivateOrganization.execute(organizationId, ctx);
  }
}
