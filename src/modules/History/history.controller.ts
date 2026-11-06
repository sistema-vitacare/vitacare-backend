import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import { UuidParam } from '@/common/http/uuidParam.pipe';
import { Permissions } from '@/modules/Access/access.permissions';
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import { PatientOverviewDto } from './GetPatientOverview/getPatientOverview.dto';
import { GetPatientOverviewUseCase } from './GetPatientOverview/getPatientOverview.useCase';

/** Historico do paciente (UC12); a lista filtrada e `GET /follow-ups`. */
@ApiTags('patients')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('patients')
export class HistoryController {
  constructor(private readonly getPatientOverview: GetPatientOverviewUseCase) {}

  @Get(':patientId/overview')
  @RequirePermissions(Permissions.PATIENT_HISTORY_READ)
  @ApiOperation({
    summary:
      'Visao consolidada de um paciente ao alcance da sessao: contadores, ultimas medicoes, medicamentos ativos e alertas recentes (UC12, Figura 36).',
  })
  @ApiEnvelope(PatientOverviewDto)
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
    { status: 403, codes: ['AUTH_FORBIDDEN'] },
    { status: 404, codes: ['PATIENT_NOT_FOUND'] },
    { status: 422, codes: ['VALIDATION_FAILED'] },
  )
  async overview(
    @Param('patientId', UuidParam('patientId')) patientId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PatientOverviewDto> {
    return this.getPatientOverview.execute(patientId, ctx);
  }
}
