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

import { CreateMedicationDto } from './CreateMedication/createMedication.dto';
import { CreateMedicationUseCase } from './CreateMedication/createMedication.useCase';
import { DeactivateMedicationUseCase } from './DeactivateMedication/deactivateMedication.useCase';
import { MedicationDto } from './dtos/medication.dto';
import { GetMedicationUseCase } from './GetMedication/getMedication.useCase';
import { ListMedicationsQueryDto } from './ListMedications/listMedications.dto';
import { ListMedicationsUseCase } from './ListMedications/listMedications.useCase';
import { ReactivateMedicationUseCase } from './ReactivateMedication/reactivateMedication.useCase';
import { UpdateMedicationDto } from './UpdateMedication/updateMedication.dto';
import { UpdateMedicationUseCase } from './UpdateMedication/updateMedication.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const NOT_FOUND = { status: 404, codes: ['MEDICATION_NOT_FOUND'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };

@ApiTags('medications')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('medications')
export class MedicationController {
  constructor(
    private readonly createMedication: CreateMedicationUseCase,
    private readonly listMedications: ListMedicationsUseCase,
    private readonly getMedication: GetMedicationUseCase,
    private readonly updateMedication: UpdateMedicationUseCase,
    private readonly deactivateMedication: DeactivateMedicationUseCase,
    private readonly reactivateMedication: ReactivateMedicationUseCase,
  ) {}

  @Post()
  @RequirePermissions(Permissions.MEDICATIONS_CREATE)
  @ApiOperation({
    summary:
      'Cadastra um medicamento de paciente ativo e programa a agenda de horarios; sobreposicao volta como aviso.',
  })
  @ApiEnvelope(MedicationDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['PATIENT_NOT_FOUND'] },
    { status: 409, codes: ['MEDICATION_PATIENT_INACTIVE'] },
    VALIDATION,
  )
  async create(
    @Body() body: CreateMedicationDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<MedicationDto> {
    return this.createMedication.execute(body, ctx);
  }

  @Get()
  @RequirePermissions(Permissions.MEDICATIONS_READ)
  @ApiOperation({
    summary:
      'Lista os medicamentos de um paciente ao alcance da sessao, paginados; ativos primeiro.',
  })
  @ApiEnvelope(MedicationDto, { isArray: true })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['PATIENT_NOT_FOUND'] },
    VALIDATION,
  )
  async list(
    @Query() query: ListMedicationsQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<MedicationDto[]>> {
    return this.listMedications.execute(query, ctx);
  }

  @Get(':medicationId')
  @RequirePermissions(Permissions.MEDICATIONS_READ)
  @ApiOperation({
    summary: 'Consulta um medicamento de paciente ao alcance da sessao.',
  })
  @ApiEnvelope(MedicationDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION)
  async get(
    @Param('medicationId', UuidParam('medicationId')) medicationId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<MedicationDto> {
    return this.getMedication.execute(medicationId, ctx);
  }

  @Patch(':medicationId')
  @RequirePermissions(Permissions.MEDICATIONS_UPDATE)
  @ApiOperation({
    summary:
      'Edita um medicamento ativo; mudar inicio, fim, intervalo, horarios ou lembretes encerra a agenda vigente e programa a nova.',
  })
  @ApiEnvelope(MedicationDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    {
      status: 409,
      codes: ['MEDICATION_INACTIVE', 'MEDICATION_PATIENT_INACTIVE'],
    },
    {
      status: 422,
      codes: [
        'VALIDATION_FAILED',
        'MEDICATION_INVALID_PERIOD',
        'MEDICATION_NOTHING_TO_UPDATE',
      ],
    },
  )
  async update(
    @Param('medicationId', UuidParam('medicationId')) medicationId: string,
    @Body() body: UpdateMedicationDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<MedicationDto> {
    return this.updateMedication.execute(medicationId, body, ctx);
  }

  @Post(':medicationId/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.MEDICATIONS_DEACTIVATE)
  @ApiOperation({
    summary:
      'Inativa o medicamento e encerra a agenda, preservando o historico.',
  })
  @ApiEnvelope(MedicationDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    { status: 409, codes: ['MEDICATION_ALREADY_INACTIVE'] },
    VALIDATION,
  )
  async deactivate(
    @Param('medicationId', UuidParam('medicationId')) medicationId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<MedicationDto> {
    return this.deactivateMedication.execute(medicationId, ctx);
  }

  @Post(':medicationId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.MEDICATIONS_DEACTIVATE)
  @ApiOperation({
    summary:
      'Reativa o medicamento de paciente ativo; a agenda volta a valer a partir de agora.',
  })
  @ApiEnvelope(MedicationDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    {
      status: 409,
      codes: ['MEDICATION_ALREADY_ACTIVE', 'MEDICATION_PATIENT_INACTIVE'],
    },
    VALIDATION,
  )
  async reactivate(
    @Param('medicationId', UuidParam('medicationId')) medicationId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<MedicationDto> {
    return this.reactivateMedication.execute(medicationId, ctx);
  }
}
