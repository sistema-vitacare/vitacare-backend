import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { setupApp } from '@/app.setup';
import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';
import { FollowUpRepository } from '@/modules/FollowUp/repositories/followUp.repository';
import { PatientEvolutionRepository } from '@/modules/Indicator/repositories/patientEvolution.repository';
import { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';
import { PatientRepository } from '@/modules/Patient/repositories/patient.repository';
import { ReportController } from '@/modules/Report/report.controller';
import {
  REPORT_PROVIDERS,
  REPORT_USE_CASES,
} from '@/modules/Report/report.module';
import { PatientReportRepository } from '@/modules/Report/repositories/patientReport.repository';
import { PatientReportPdfService } from '@/modules/Report/services/patientReportPdf.service';

import { followUpDetail } from '../FollowUp/followUp.fixtures';
import { medicationRow } from '../Medication/medication.fixtures';
import {
  ORGANIZATION_ID,
  PATIENT_ID,
  patientRow,
  sessionOf,
} from '../Patient/patient.fixtures';
import { extractPdfText } from './pdfText';
import { glicemiaPoint } from './report.fixtures';

interface SchemaObject {
  $ref?: string;
  type?: string;
  format?: string;
  required?: string[];
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
}

interface Operation {
  summary?: string;
  security?: unknown[];
  responses: Record<
    string,
    { content?: Record<string, { schema?: SchemaObject }> }
  >;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, SchemaObject> };
}

const SESSIONS = {
  'Bearer admin': sessionOf(ProfileCode.ADMIN),
  'Bearer professional': sessionOf(ProfileCode.PROFESSIONAL),
  'Bearer caregiver': sessionOf(ProfileCode.CAREGIVER),
  'Bearer family': sessionOf(ProfileCode.FAMILY),
} as const;

class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session =
      SESSIONS[(request.headers.authorization ?? '') as keyof typeof SESSIONS];

    if (!session) {
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'Bearer ausente ou malformado.',
      });
    }

    request.context = session;

    return true;
  }
}

describe('Report HTTP (e2e)', () => {
  let app: INestApplication;
  const patients = { findById: jest.fn() };
  const followUps = { list: jest.fn() };
  const evolution = { findPoints: jest.fn() };
  const medications = { list: jest.fn() };
  const reports = { findHeader: jest.fn(), recordExport: jest.fn() };
  let pdf: PatientReportPdfService;

  const server = (): App => app.getHttpServer() as App;

  const call = (path: string, who?: string, query = '') => {
    const call = request(server()).get(
      `/api/v1/patients/${PATIENT_ID}/${path}${query}`,
    );

    return who ? call.set('Authorization', `Bearer ${who}`) : call;
  };

  const download = (who: string, query = '') =>
    call('report/pdf', who, query)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  const happyPath = () => {
    patients.findById.mockResolvedValue(patientRow());
    followUps.list.mockResolvedValue([[followUpDetail()], 1]);
    evolution.findPoints.mockResolvedValue([
      glicemiaPoint('105', '2026-10-01T03:00:00.000Z'),
      glicemiaPoint('98', '2026-10-10T03:00:00.000Z'),
      glicemiaPoint('142', '2026-10-19T03:00:00.000Z'),
    ]);
    medications.list.mockResolvedValue({
      kind: 'ok',
      items: [medicationRow()],
      total: 1,
      others: [],
    });
    reports.findHeader.mockResolvedValue({
      organizationName: 'Clinica Sintetica',
      userName: 'Profissional Sintetico',
    });
    reports.recordExport.mockResolvedValue(undefined);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportController],
      providers: [
        ...REPORT_USE_CASES,
        ...REPORT_PROVIDERS,
        { provide: PatientRepository, useValue: patients },
        { provide: FollowUpRepository, useValue: followUps },
        { provide: PatientEvolutionRepository, useValue: evolution },
        { provide: MedicationRepository, useValue: medications },
        { provide: PatientReportRepository, useValue: reports },
        { provide: APP_GUARD, useClass: StubAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();

    pdf = moduleRef.get(PatientReportPdfService);
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });

    setupApp(app as NestExpressApplication, {
      apiPrefix: 'api',
      apiVersion: '1',
      isProduction: false,
      corsOrigins: [],
      corsCredentials: false,
      swaggerEnabled: true,
      swaggerPath: 'docs',
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  it('JSON envelopado com o mesmo conteudo do PDF, sem auditoria', async () => {
    happyPath();

    const response = await call(
      'report',
      'professional',
      '?from=2026-10-01&to=2026-10-31',
    );

    expect(response.status).toBe(200);
    expect(response.body as object).toMatchObject({
      data: {
        organization: { name: 'Clinica Sintetica' },
        period: { from: '2026-10-01', to: '2026-10-31' },
        patient: { id: PATIENT_ID, name: 'Paciente Sintetico' },
        records: { total: 1 },
        series: [{ name: 'Glicemia capilar', indicators: { mean: 115 } }],
        medications: [{ name: 'Losartana potassica' }],
      },
      meta: { requestId: expect.any(String) as unknown },
    });
    expect(
      (response.body as { data: { patient: object } }).data.patient,
    ).not.toHaveProperty('cpf');
    expect(patients.findById).toHaveBeenCalledWith(
      {
        organizationId: ORGANIZATION_ID,
        viewerUserId: null,
        viewerLinkRoles: [],
      },
      PATIENT_ID,
    );
    expect(reports.recordExport).not.toHaveBeenCalled();
  });

  it('PDF como anexo, sem cache, auditado e com o texto do relatorio', async () => {
    happyPath();

    const response = await download('admin', '?from=2026-10-01&to=2026-10-31');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="relatorio-paciente-2026-10-01-a-2026-10-31.pdf"',
    );
    expect(response.headers['cache-control']).toBe('private, no-store');

    const text = (await extractPdfText(response.body as Buffer)).join('\n');

    expect(text).toContain('Paciente Sintetico');
    expect(text).toContain('Média: 115 mg/dL');
    expect(text).not.toContain('52998224725');
    expect(reports.recordExport).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      PATIENT_ID,
      { from: '2026-10-01', to: '2026-10-31' },
    );
  });

  it('falha na geracao: 500 REPORT_EXPORT_FAILED em JSON, sem auditoria; repetir funciona', async () => {
    happyPath();
    jest
      .spyOn(pdf as unknown as { draw: () => Promise<Buffer> }, 'draw')
      .mockRejectedValueOnce(new Error('falha sintetica'));

    const failed = await call('report/pdf', 'professional');

    expect(failed.status).toBe(500);
    expect(failed.body as object).toMatchObject({
      error: {
        code: 'REPORT_EXPORT_FAILED',
        message: 'Não foi possível gerar o PDF do relatório. Tente novamente.',
        detail: null,
      },
    });
    expect(reports.recordExport).not.toHaveBeenCalled();

    const retried = await download('professional');

    expect(retried.status).toBe(200);
    expect(reports.recordExport).toHaveBeenCalledTimes(1);
  });

  it('fora do alcance e 404 PATIENT_NOT_FOUND nas duas rotas, sem PDF nem auditoria', async () => {
    patients.findById.mockResolvedValue(null);

    for (const path of ['report', 'report/pdf']) {
      const response = await call(path, 'professional');

      expect(response.status).toBe(404);
      expect(response.body as object).toMatchObject({
        error: { code: 'PATIENT_NOT_FOUND' },
      });
    }
    expect(reports.recordExport).not.toHaveBeenCalled();
  });

  it('sem sessao 401, cuidador e familiar 403, entrada invalida 422', async () => {
    for (const path of ['report', 'report/pdf']) {
      expect((await call(path)).status).toBe(401);
      expect((await call(path, 'caregiver')).status).toBe(403);
      expect((await call(path, 'family')).status).toBe(403);
      expect(
        (await call(path, 'professional', '?from=2026-02-30')).status,
      ).toBe(422);
      expect(
        (await call(path, 'professional', '?from=2025-01-01&to=2026-01-02'))
          .status,
      ).toBe(422);
      expect((await call(path, 'professional', '?formId=x')).status).toBe(422);
    }
    expect(patients.findById).not.toHaveBeenCalled();
  });

  it('publica as duas rotas no OpenAPI com bearer, envelope, binario e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;
    const json = document.paths['/api/v1/patients/{patientId}/report']?.get;
    const binary =
      document.paths['/api/v1/patients/{patientId}/report/pdf']?.get;

    expect(json.security).toEqual([{ bearer: [] }]);
    expect(binary.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(json.responses).sort()).toEqual([
      '200',
      '401',
      '403',
      '404',
      '422',
    ]);
    expect(Object.keys(binary.responses).sort()).toEqual([
      '200',
      '401',
      '403',
      '404',
      '422',
      '500',
    ]);

    const envelope = json.responses['200'].content?.['application/json']
      .schema as SchemaObject;

    expect(envelope.properties?.data?.$ref).toBe(
      '#/components/schemas/PatientReportDto',
    );
    expect(binary.responses['200'].content?.['application/pdf'].schema).toEqual(
      { type: 'string', format: 'binary' },
    );

    const schemas = document.components.schemas;

    expect(schemas.PatientReportDto.required?.sort()).toEqual([
      'generatedAt',
      'generatedBy',
      'medications',
      'organization',
      'patient',
      'period',
      'records',
      'series',
    ]);
    expect(Object.keys(schemas.ReportPatientDto.properties ?? {})).not.toEqual(
      expect.arrayContaining(['cpf']),
    );
    expect(schemas.ReportRecordsDto.properties?.items?.items?.$ref).toBe(
      '#/components/schemas/FollowUpDto',
    );
    expect(schemas.PatientReportDto.properties?.series?.items?.$ref).toBe(
      '#/components/schemas/EvolutionSeriesDto',
    );
  });
});
