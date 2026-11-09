import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import { UuidParam } from '@/common/http/uuidParam.pipe';
import { Permissions } from '@/modules/Access/access.permissions';
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import { ExportPatientReportUseCase } from './ExportPatientReport/exportPatientReport.useCase';
import {
  PatientReportDto,
  PatientReportQueryDto,
} from './GetPatientReport/getPatientReport.dto';
import { GetPatientReportUseCase } from './GetPatientReport/getPatientReport.useCase';

const REPORT_ERRORS = [
  { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
  { status: 403, codes: ['AUTH_FORBIDDEN'] },
  { status: 404, codes: ['PATIENT_NOT_FOUND'] },
  { status: 422, codes: ['VALIDATION_FAILED', 'REPORT_TOO_MANY_RECORDS'] },
];

/** Relatorio do paciente (RF012, UC10). */
@ApiTags('patients')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('patients')
export class ReportController {
  constructor(
    private readonly getPatientReport: GetPatientReportUseCase,
    private readonly exportPatientReport: ExportPatientReportUseCase,
  ) {}

  @Get(':patientId/report')
  @RequirePermissions(Permissions.REPORTS_GENERATE)
  @ApiOperation({
    summary:
      'Relatorio consolidado do paciente no periodo: identificacao, registros validos, series com indicadores e medicamentos ativos; o mesmo conteudo do PDF (RF012, UC10).',
  })
  @ApiEnvelope(PatientReportDto)
  @ApiErrors(...REPORT_ERRORS)
  async report(
    @Param('patientId', UuidParam('patientId')) patientId: string,
    @Query() query: PatientReportQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PatientReportDto> {
    return this.getPatientReport.execute(patientId, query, ctx);
  }

  @Get(':patientId/report/pdf')
  @RequirePermissions(Permissions.REPORTS_GENERATE)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Exporta o relatorio do paciente em PDF (binario, fora do envelope), gerado na hora, sem guardar arquivo, e registrado na auditoria (RF012, UC10).',
  })
  @ApiProduces('application/pdf', 'application/json')
  @ApiOkResponse({
    description:
      'PDF com Content-Disposition attachment. Erros saem em JSON; em falha na geracao, repetir o pedido.',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiErrors(...REPORT_ERRORS, {
    status: 500,
    codes: ['REPORT_EXPORT_FAILED'],
  })
  async pdf(
    @Param('patientId', UuidParam('patientId')) patientId: string,
    @Query() query: PatientReportQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<StreamableFile> {
    return this.exportPatientReport.execute(patientId, query, ctx);
  }
}
