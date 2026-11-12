import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import type { EnvelopePayload } from '@/common/http/envelope';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import { UuidParam } from '@/common/http/uuidParam.pipe';
import { Permissions } from '@/modules/Access/access.permissions';
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import {
  GetPatientEvolutionQueryDto,
  PatientEvolutionDto,
} from './GetPatientEvolution/getPatientEvolution.dto';
import { GetPatientEvolutionUseCase } from './GetPatientEvolution/getPatientEvolution.useCase';

/** Evolucao e indicadores do paciente (RF011, UC10, UC14). */
@ApiTags('patients')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('patients')
export class IndicatorController {
  constructor(
    private readonly getPatientEvolution: GetPatientEvolutionUseCase,
  ) {}

  @Get(':patientId/evolution')
  @RequirePermissions(Permissions.PATIENT_EVOLUTION_READ)
  @ApiOperation({
    summary:
      'Series de evolucao por parametro numerico de um paciente ao alcance da sessao, com media, variacao e tendencia no periodo (RF011, UC10, UC14).',
  })
  @ApiEnvelope(PatientEvolutionDto, {
    description:
      'Sem medicao no periodo (`series: []`), `meta.message` traz "Nenhuma medição no período selecionado." (UC14 alternativo).',
  })
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
    { status: 403, codes: ['AUTH_FORBIDDEN'] },
    { status: 404, codes: ['PATIENT_NOT_FOUND'] },
    { status: 422, codes: ['VALIDATION_FAILED'] },
  )
  async evolution(
    @Param('patientId', UuidParam('patientId')) patientId: string,
    @Query() query: GetPatientEvolutionQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<PatientEvolutionDto>> {
    return this.getPatientEvolution.execute(patientId, query, ctx);
  }
}
