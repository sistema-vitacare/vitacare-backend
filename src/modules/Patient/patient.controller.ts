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

import { CreatePatientDto } from './CreatePatient/createPatient.dto';
import { CreatePatientUseCase } from './CreatePatient/createPatient.useCase';
import { DeactivatePatientUseCase } from './DeactivatePatient/deactivatePatient.useCase';
import { PatientDto } from './dtos/patient.dto';
import { GetPatientUseCase } from './GetPatient/getPatient.useCase';
import { ListPatientsQueryDto } from './ListPatients/listPatients.dto';
import { ListPatientsUseCase } from './ListPatients/listPatients.useCase';
import { ReactivatePatientUseCase } from './ReactivatePatient/reactivatePatient.useCase';
import { UpdatePatientDto } from './UpdatePatient/updatePatient.dto';
import { UpdatePatientUseCase } from './UpdatePatient/updatePatient.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const NOT_FOUND = { status: 404, codes: ['PATIENT_NOT_FOUND'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };
const PLAN_SEAT = ['PATIENT_PLAN_LIMIT_REACHED', 'PATIENT_PLAN_EXPIRED'];

@ApiTags('patients')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('patients')
export class PatientController {
  constructor(
    private readonly createPatient: CreatePatientUseCase,
    private readonly listPatients: ListPatientsUseCase,
    private readonly getPatient: GetPatientUseCase,
    private readonly updatePatient: UpdatePatientUseCase,
    private readonly deactivatePatient: DeactivatePatientUseCase,
    private readonly reactivatePatient: ReactivatePatientUseCase,
  ) {}

  @Post()
  @RequirePermissions(Permissions.PATIENTS_CREATE)
  @ApiOperation({
    summary:
      'Cadastra um paciente ativo na organizacao da sessao, vinculado ao profissional responsavel.',
  })
  @ApiEnvelope(PatientDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 409, codes: ['PATIENT_DUPLICATE_CPF', ...PLAN_SEAT] },
    {
      status: 422,
      codes: ['VALIDATION_FAILED', 'PATIENT_INVALID_RESPONSIBLE'],
    },
  )
  async create(
    @Body() body: CreatePatientDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PatientDto> {
    return this.createPatient.execute(body, ctx);
  }

  @Get()
  @RequirePermissions(Permissions.PATIENTS_READ)
  @ApiOperation({
    summary:
      'Lista os pacientes ao alcance da sessao, paginados; por padrao so os ativos.',
  })
  @ApiEnvelope(PatientDto, { isArray: true })
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, VALIDATION)
  async list(
    @Query() query: ListPatientsQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<PatientDto[]>> {
    return this.listPatients.execute(query, ctx);
  }

  @Get(':patientId')
  @RequirePermissions(Permissions.PATIENTS_READ)
  @ApiOperation({ summary: 'Consulta um paciente ao alcance da sessao.' })
  @ApiEnvelope(PatientDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION)
  async get(
    @Param('patientId', UuidParam('patientId')) patientId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PatientDto> {
    return this.getPatient.execute(patientId, ctx);
  }

  @Patch(':patientId')
  @RequirePermissions(Permissions.PATIENTS_UPDATE)
  @ApiOperation({
    summary:
      'Edita dados cadastrais e clinicos basicos ou troca o responsavel de um paciente ativo.',
  })
  @ApiEnvelope(PatientDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    { status: 409, codes: ['PATIENT_DUPLICATE_CPF', 'PATIENT_INACTIVE'] },
    {
      status: 422,
      codes: [
        'VALIDATION_FAILED',
        'PATIENT_INVALID_RESPONSIBLE',
        'PATIENT_NOTHING_TO_UPDATE',
      ],
    },
  )
  async update(
    @Param('patientId', UuidParam('patientId')) patientId: string,
    @Body() body: UpdatePatientDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PatientDto> {
    return this.updatePatient.execute(patientId, body, ctx);
  }

  @Post(':patientId/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.PATIENTS_DEACTIVATE)
  @ApiOperation({
    summary:
      'Inativa o paciente: sai da listagem principal e libera a vaga, preservando vinculos e historico.',
  })
  @ApiEnvelope(PatientDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    { status: 409, codes: ['PATIENT_ALREADY_INACTIVE'] },
    VALIDATION,
  )
  async deactivate(
    @Param('patientId', UuidParam('patientId')) patientId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PatientDto> {
    return this.deactivatePatient.execute(patientId, ctx);
  }

  @Post(':patientId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.PATIENTS_DEACTIVATE)
  @ApiOperation({
    summary:
      'Reativa o paciente inativo, respeitando o limite de pacientes ativos e a vigencia do plano.',
  })
  @ApiEnvelope(PatientDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    { status: 409, codes: ['PATIENT_ALREADY_ACTIVE', ...PLAN_SEAT] },
    VALIDATION,
  )
  async reactivate(
    @Param('patientId', UuidParam('patientId')) patientId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PatientDto> {
    return this.reactivatePatient.execute(patientId, ctx);
  }
}
