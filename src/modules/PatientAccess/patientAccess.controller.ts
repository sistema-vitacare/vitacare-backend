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

import { CreatePatientLinkDto } from './CreatePatientLink/createPatientLink.dto';
import { CreatePatientLinkUseCase } from './CreatePatientLink/createPatientLink.useCase';
import { EligibleUserDto, PatientLinkDto } from './dtos/patientLink.dto';
import { GetPatientLinkUseCase } from './GetPatientLink/getPatientLink.useCase';
import { ListEligibleUsersQueryDto } from './ListEligibleUsers/listEligibleUsers.dto';
import { ListEligibleUsersUseCase } from './ListEligibleUsers/listEligibleUsers.useCase';
import { ListPatientLinksQueryDto } from './ListPatientLinks/listPatientLinks.dto';
import { ListPatientLinksUseCase } from './ListPatientLinks/listPatientLinks.useCase';
import { RevokePatientLinkUseCase } from './RevokePatientLink/revokePatientLink.useCase';
import { UpdatePatientLinkDto } from './UpdatePatientLink/updatePatientLink.dto';
import { UpdatePatientLinkUseCase } from './UpdatePatientLink/updatePatientLink.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const NOT_FOUND = { status: 404, codes: ['PATIENT_LINK_NOT_FOUND'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };

/** Todas as rotas exigem `patient_links:manage` (admin e profissional). */
@ApiTags('patient-links')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@RequirePermissions(Permissions.PATIENT_LINKS_MANAGE)
@Controller('patient-links')
export class PatientAccessController {
  constructor(
    private readonly createLink: CreatePatientLinkUseCase,
    private readonly listLinks: ListPatientLinksUseCase,
    private readonly getLink: GetPatientLinkUseCase,
    private readonly updateLink: UpdatePatientLinkUseCase,
    private readonly revokeLink: RevokePatientLinkUseCase,
    private readonly listEligibleUsers: ListEligibleUsersUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Vincula um cuidador ou familiar a um paciente ativo; o papel vem do perfil do usuario.',
  })
  @ApiEnvelope(PatientLinkDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['PATIENT_NOT_FOUND'] },
    {
      status: 409,
      codes: ['PATIENT_LINK_ALREADY_EXISTS', 'PATIENT_INACTIVE'],
    },
    { status: 422, codes: ['VALIDATION_FAILED', 'PATIENT_LINK_INVALID_USER'] },
  )
  async create(
    @Body() body: CreatePatientLinkDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PatientLinkDto> {
    return this.createLink.execute(body, ctx);
  }

  @Get()
  @ApiOperation({
    summary:
      'Lista os vinculos da organizacao, filtrando por paciente, usuario, papel e status; por padrao so os vigentes.',
  })
  @ApiEnvelope(PatientLinkDto, { isArray: true })
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, VALIDATION)
  async list(
    @Query() query: ListPatientLinksQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<PatientLinkDto[]>> {
    return this.listLinks.execute(query, ctx);
  }

  @Get('eligible-users')
  @ApiOperation({
    summary:
      'Lista usuarios nao inativos aceitos num papel (responsavel, cuidador ou familiar), so com id, nome, perfil e status.',
  })
  @ApiEnvelope(EligibleUserDto, { isArray: true })
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, VALIDATION)
  async eligibleUsers(
    @Query() query: ListEligibleUsersQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<EligibleUserDto[]>> {
    return this.listEligibleUsers.execute(query, ctx);
  }

  @Get(':linkId')
  @ApiOperation({ summary: 'Consulta um vinculo, vigente ou revogado.' })
  @ApiEnvelope(PatientLinkDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION)
  async get(
    @Param('linkId', UuidParam('linkId')) linkId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PatientLinkDto> {
    return this.getLink.execute(linkId, ctx);
  }

  @Patch(':linkId')
  @ApiOperation({
    summary:
      'Altera tipo e observacao de um vinculo de cuidado vigente de paciente ativo.',
  })
  @ApiEnvelope(PatientLinkDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    {
      status: 409,
      codes: [
        'PATIENT_LINK_REVOKED',
        'PATIENT_LINK_RESPONSIBLE_READ_ONLY',
        'PATIENT_INACTIVE',
      ],
    },
    {
      status: 422,
      codes: ['VALIDATION_FAILED', 'PATIENT_LINK_NOTHING_TO_UPDATE'],
    },
  )
  async update(
    @Param('linkId', UuidParam('linkId')) linkId: string,
    @Body() body: UpdatePatientLinkDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PatientLinkDto> {
    return this.updateLink.execute(linkId, body, ctx);
  }

  @Post(':linkId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Revoga o vinculo de cuidado: o acesso cai na proxima requisicao e o historico fica.',
  })
  @ApiEnvelope(PatientLinkDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    {
      status: 409,
      codes: ['PATIENT_LINK_REVOKED', 'PATIENT_LINK_RESPONSIBLE_READ_ONLY'],
    },
    VALIDATION,
  )
  async revoke(
    @Param('linkId', UuidParam('linkId')) linkId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PatientLinkDto> {
    return this.revokeLink.execute(linkId, ctx);
  }
}
