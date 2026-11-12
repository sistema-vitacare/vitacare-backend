import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import type { EnvelopePayload } from '@/common/http/envelope';
import { Permissions } from '@/modules/Access/access.permissions';
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import { ManagementReportQueryDto } from './dtos/managementReport.dto';
import { ExportAlertsReportUseCase } from './ExportAlertsReport/exportAlertsReport.useCase';
import { ExportCaregiverActivityReportUseCase } from './ExportCaregiverActivityReport/exportCaregiverActivityReport.useCase';
import { AlertsReportDto } from './GetAlertsReport/getAlertsReport.dto';
import { GetAlertsReportUseCase } from './GetAlertsReport/getAlertsReport.useCase';
import { CaregiverActivityReportDto } from './GetCaregiverActivityReport/getCaregiverActivityReport.dto';
import { GetCaregiverActivityReportUseCase } from './GetCaregiverActivityReport/getCaregiverActivityReport.useCase';
import { ManagementReportTypeDto } from './ListManagementReportTypes/listManagementReportTypes.dto';
import { ListManagementReportTypesUseCase } from './ListManagementReportTypes/listManagementReportTypes.useCase';
import { RecentReportDto } from './ListRecentReports/listRecentReports.dto';
import { ListRecentReportsUseCase } from './ListRecentReports/listRecentReports.useCase';

/** 500 e "falha ao gerar": a nova tentativa e repetir o pedido. */
const AUTH_ERRORS = [
  { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
  {
    status: 403,
    codes: ['AUTH_FORBIDDEN', 'MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE'],
  },
  { status: 500, codes: ['INTERNAL_ERROR'] },
];

const QUERY_ERRORS = [
  ...AUTH_ERRORS,
  { status: 422, codes: ['VALIDATION_FAILED'] },
];

const PDF_RESPONSE = ApiOkResponse({
  description:
    'PDF com Content-Disposition attachment, gerado na hora e sem guardar. Erros saem em JSON; em falha na geracao, repetir o pedido.',
  content: {
    'application/pdf': { schema: { type: 'string', format: 'binary' } },
  },
});

const PDF_FAILURE = { status: 500, codes: ['MANAGEMENT_REPORT_EXPORT_FAILED'] };

const ALERTS_ERRORS = [
  ...AUTH_ERRORS,
  {
    status: 422,
    codes: ['VALIDATION_FAILED', 'MANAGEMENT_REPORT_TOO_MANY_ALERTS'],
  },
];

/**
 * Relatorios gerenciais do plano Enterprise (Quadro 2, Figura 43, BE-30). So
 * admin e plano com `management_reports`; dados sempre da organizacao da sessao.
 */
@ApiTags('management-reports')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('management-reports')
@RequirePermissions(Permissions.MANAGEMENT_REPORTS_GENERATE)
export class ManagementReportController {
  constructor(
    private readonly listTypes: ListManagementReportTypesUseCase,
    private readonly listRecent: ListRecentReportsUseCase,
    private readonly getAlerts: GetAlertsReportUseCase,
    private readonly getCaregivers: GetCaregiverActivityReportUseCase,
    private readonly exportAlerts: ExportAlertsReportUseCase,
    private readonly exportCaregivers: ExportCaregiverActivityReportUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Catalogo dos tipos de relatorio da Figura 43 com as rotas e o total de exportacoes de cada um ("N gerados").',
  })
  @ApiEnvelope(ManagementReportTypeDto, { isArray: true })
  @ApiErrors(...AUTH_ERRORS)
  types(
    @CurrentContext() ctx: RequestContext,
  ): Promise<ManagementReportTypeDto[]> {
    return this.listTypes.execute(ctx);
  }

  @Get('recent')
  @ApiOperation({
    summary:
      'Relatorios exportados recentemente na organizacao (gerenciais e do paciente), lidos da auditoria; nada fica guardado para baixar de novo.',
  })
  @ApiEnvelope(RecentReportDto, { isArray: true })
  @ApiErrors(...QUERY_ERRORS)
  recent(
    @Query() query: PaginationQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<RecentReportDto[]>> {
    return this.listRecent.execute(query, ctx);
  }

  @Get('alerts')
  @ApiOperation({
    summary:
      'Alertas e intercorrencias: alertas das tres origens emitidos no periodo por origem, severidade e status, tempo ate a resolucao, pacientes com mais alertas, serie diaria e as intercorrencias (critical) mais recentes; o mesmo conteudo do PDF.',
  })
  @ApiEnvelope(AlertsReportDto)
  @ApiErrors(...ALERTS_ERRORS)
  alerts(
    @Query() query: ManagementReportQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<AlertsReportDto>> {
    return this.getAlerts.execute(query, ctx);
  }

  @Get('caregivers')
  @ApiOperation({
    summary:
      'Atividade dos cuidadores: vinculos, registros validos e anulados, pacientes com e sem registro, alertas de ausencia e alertas resolvidos por cuidador no periodo, sem classificacao de desempenho; o mesmo conteudo do PDF.',
  })
  @ApiEnvelope(CaregiverActivityReportDto)
  @ApiErrors(...QUERY_ERRORS)
  caregivers(
    @Query() query: ManagementReportQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<CaregiverActivityReportDto>> {
    return this.getCaregivers.execute(query, ctx);
  }

  @Get('alerts/pdf')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Exporta "Alertas e intercorrencias" em PDF (binario, fora do envelope), registrado na auditoria como management_report.exported.',
  })
  @ApiProduces('application/pdf', 'application/json')
  @PDF_RESPONSE
  @ApiErrors(...ALERTS_ERRORS, PDF_FAILURE)
  alertsPdf(
    @Query() query: ManagementReportQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<StreamableFile> {
    return this.exportAlerts.execute(query, ctx);
  }

  @Get('caregivers/pdf')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Exporta "Atividade dos cuidadores" em PDF (binario, fora do envelope), registrado na auditoria como management_report.exported.',
  })
  @ApiProduces('application/pdf', 'application/json')
  @PDF_RESPONSE
  @ApiErrors(...QUERY_ERRORS, PDF_FAILURE)
  caregiversPdf(
    @Query() query: ManagementReportQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<StreamableFile> {
    return this.exportCaregivers.execute(query, ctx);
  }
}
