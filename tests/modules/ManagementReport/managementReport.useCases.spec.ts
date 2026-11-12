import { ProfileCode } from '@/common/context/requestContext.type';
import type { DomainException } from '@/common/errors/domain.exception';
import { isEnvelopePayload } from '@/common/http/envelope';
import type { AlertsReportDto } from '@/modules/ManagementReport/GetAlertsReport/getAlertsReport.dto';
import { GetAlertsReportUseCase } from '@/modules/ManagementReport/GetAlertsReport/getAlertsReport.useCase';
import type { CaregiverActivityReportDto } from '@/modules/ManagementReport/GetCaregiverActivityReport/getCaregiverActivityReport.dto';
import { GetCaregiverActivityReportUseCase } from '@/modules/ManagementReport/GetCaregiverActivityReport/getCaregiverActivityReport.useCase';
import type { ManagementReportTypeDto } from '@/modules/ManagementReport/ListManagementReportTypes/listManagementReportTypes.dto';
import { ListManagementReportTypesUseCase } from '@/modules/ManagementReport/ListManagementReportTypes/listManagementReportTypes.useCase';
import type { RecentReportDto } from '@/modules/ManagementReport/ListRecentReports/listRecentReports.dto';
import { ListRecentReportsUseCase } from '@/modules/ManagementReport/ListRecentReports/listRecentReports.useCase';

import { ORGANIZATION_ID, sessionOf } from '../Patient/patient.fixtures';
import {
  alertSummary,
  asRepository,
  CAREGIVER_ID,
  caregiverRow,
  EMPTY_SUMMARY,
  intercurrence,
  managementReportRepositoryMock,
  type ManagementReportRepositoryMock,
  PATIENT_A,
} from './managementReport.fixtures';

const ctx = sessionOf(ProfileCode.ADMIN);
const TODAY = '2026-11-12';
const OCTOBER = { from: '2026-10-01', to: '2026-10-03' };

const unwrap = <T>(result: unknown) => {
  if (!isEnvelopePayload(result)) throw new Error('esperava envelope');

  return {
    data: result.data as T,
    message: result.extras.message,
    pagination: result.extras.pagination,
  };
};

const codeOf = async (promise: Promise<unknown>) =>
  ((await promise.catch((error: unknown) => error)) as DomainException).code;

const DATA_READS = [
  'organization',
  'alertSummary',
  'alertsByDay',
  'topPatients',
  'intercurrences',
  'caregiverActivity',
  'caregiverSummary',
  'exportCounts',
  'recentExports',
] as const;

const expectNoDataRead = (repo: ManagementReportRepositoryMock) => {
  for (const method of DATA_READS) expect(repo[method]).not.toHaveBeenCalled();
};

describe('relatorios gerenciais (casos de uso)', () => {
  let repo: ManagementReportRepositoryMock;

  beforeEach(() => {
    repo = managementReportRepositoryMock();
  });

  describe('alertas e intercorrencias', () => {
    const run = (query: object = OCTOBER) =>
      new GetAlertsReportUseCase(asRepository(repo)).execute(query, ctx, TODAY);

    it('monta o relatorio com horas, dias preenchidos e a lista de intercorrencias', async () => {
      repo.alertsByDay.mockResolvedValue([
        { date: '2026-10-02', total: 4, intercurrences: 2 },
      ]);
      repo.topPatients.mockResolvedValue([
        {
          id: PATIENT_A,
          name: 'Paciente Sintetico',
          status: 'inactive',
          total: 4,
          intercurrences: 2,
          open: 1,
        },
      ]);
      repo.intercurrences.mockResolvedValue([
        intercurrence(),
        intercurrence({
          id: '9a000000-0000-4000-8000-000000000002',
          source: 'absence',
          subject: 'Sinais vitais',
          status: 'open',
          resolvedAt: null,
          secondsToResolve: null,
        }),
      ]);

      const { data, message } = unwrap<AlertsReportDto>(
        await run({ ...OCTOBER, condition: 'diab' }),
      );

      expect(message).toBeUndefined();
      expect(data).toMatchObject({
        period: { ...OCTOBER, timeZone: 'America/Sao_Paulo' },
        condition: 'diab',
        organization: { id: ORGANIZATION_ID, name: 'Clinica Sintetica' },
        totals: { issued: 6, open: 2, resolved: 4, intercurrences: 2 },
        bySource: {
          reading: { total: 3, open: 1, resolved: 2 },
          absence: { total: 2, open: 1, resolved: 1 },
          medicationReminder: { total: 1, open: 0, resolved: 1 },
        },
        bySeverity: { critical: { total: 2, open: 1, resolved: 1 } },
        resolution: {
          overall: { resolved: 4, averageHours: 1.5, medianHours: 1 },
          bySeverity: {
            critical: { resolved: 1, averageHours: 2, medianHours: 2 },
            info: { resolved: 0, averageHours: null, medianHours: null },
          },
        },
        topPatients: [
          {
            patient: {
              id: PATIENT_A,
              name: 'Paciente Sintetico',
              status: 'inactive',
            },
            total: 4,
            intercurrences: 2,
            open: 1,
          },
        ],
        byDay: [
          { date: '2026-10-01', total: 0, intercurrences: 0 },
          { date: '2026-10-02', total: 4, intercurrences: 2 },
          { date: '2026-10-03', total: 0, intercurrences: 0 },
        ],
        intercurrences: [
          {
            id: '9a000000-0000-4000-8000-000000000001',
            generatedAt: '2026-10-20T12:00:00.000Z',
            source: 'reading',
            patient: { id: PATIENT_A, name: 'Paciente Sintetico' },
            subject: 'Glicemia',
            status: 'resolved',
            resolvedAt: '2026-10-20T14:00:00.000Z',
            hoursToResolve: 2,
          },
          {
            source: 'absence',
            subject: 'Sinais vitais',
            resolvedAt: null,
            hoursToResolve: null,
          },
        ],
        intercurrencesTruncated: false,
      });
      expect(typeof data.generatedAt).toBe('string');
      expect(repo.alertSummary).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        OCTOBER,
        'diab',
      );
      expect(repo.topPatients).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        OCTOBER,
        'diab',
        10,
      );
      expect(repo.intercurrences).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        OCTOBER,
        'diab',
        200,
      );
    });

    it('sem condicao consulta com null e o padrao e 30 dias ate hoje', async () => {
      const { data } = unwrap<AlertsReportDto>(await run({}));

      expect(data.condition).toBeNull();
      expect(data.period).toMatchObject({
        from: '2026-10-14',
        to: '2026-11-12',
      });
      expect(repo.alertSummary).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        { from: '2026-10-14', to: '2026-11-12' },
        null,
      );
    });

    it('so mais de 200 intercorrencias marca a lista como cortada', async () => {
      repo.alertSummary.mockResolvedValue(
        alertSummary({
          totals: { total: 300, open: 0, resolved: 300, intercurrences: 200 },
        }),
      );
      expect(
        unwrap<AlertsReportDto>(await run()).data.intercurrencesTruncated,
      ).toBe(false);

      repo.alertSummary.mockResolvedValue(
        alertSummary({
          totals: { total: 300, open: 0, resolved: 300, intercurrences: 201 },
        }),
      );
      expect(
        unwrap<AlertsReportDto>(await run()).data.intercurrencesTruncated,
      ).toBe(true);
    });

    it('periodo sem alertas: zeros e mensagem', async () => {
      repo.alertSummary.mockResolvedValue(EMPTY_SUMMARY);

      const { data, message } = unwrap<AlertsReportDto>(await run());

      expect(message).toBe('Nenhum alerta emitido no período selecionado.');
      expect(data.totals).toEqual({
        issued: 0,
        open: 0,
        resolved: 0,
        intercurrences: 0,
      });
      expect(data.resolution.overall).toEqual({
        resolved: 0,
        averageHours: null,
        medianHours: null,
      });
      expect(data.byDay).toHaveLength(3);
    });

    it('mais de 10.000 alertas e 422 antes das demais consultas', async () => {
      repo.alertSummary.mockResolvedValue(
        alertSummary({
          totals: { total: 10_001, open: 0, resolved: 0, intercurrences: 0 },
        }),
      );

      expect(await codeOf(run())).toBe('MANAGEMENT_REPORT_TOO_MANY_ALERTS');
      expect(repo.intercurrences).not.toHaveBeenCalled();
      expect(repo.topPatients).not.toHaveBeenCalled();
    });

    it('plano sem o recurso e 403 sem consultar dados', async () => {
      repo.hasManagementReports.mockResolvedValue(false);

      expect(await codeOf(run())).toBe(
        'MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE',
      );
      expectNoDataRead(repo);
    });

    it('periodo longo demais e 422 antes do plano', async () => {
      expect(await codeOf(run({ from: '2025-01-01', to: '2026-01-02' }))).toBe(
        'VALIDATION_FAILED',
      );
      expect(repo.hasManagementReports).not.toHaveBeenCalled();
    });
  });

  describe('atividade dos cuidadores', () => {
    const run = (query: object = OCTOBER) =>
      new GetCaregiverActivityReportUseCase(asRepository(repo)).execute(
        query,
        ctx,
        TODAY,
      );

    it('linhas com pacientes sem registro e resumo da organizacao', async () => {
      repo.caregiverActivity.mockResolvedValue([
        caregiverRow(),
        caregiverRow({
          id: '5555555b-0000-4000-8000-00000000000b',
          name: 'Cuidador Inativo',
          status: 'inactive',
          profile: 'family',
          linkedPatients: 1,
          validFollowUps: 0,
          annulledFollowUps: 2,
          patientsWithFollowUp: 0,
          absenceAlerts: 3,
          resolvedAlerts: 0,
        }),
      ]);
      repo.caregiverSummary.mockResolvedValue({
        linkedPatients: 3,
        absenceAlerts: 3,
      });

      const { data, message } = unwrap<CaregiverActivityReportDto>(
        await run({ ...OCTOBER, condition: 'hipert' }),
      );

      expect(message).toBeUndefined();
      expect(data).toMatchObject({
        period: { ...OCTOBER, timeZone: 'America/Sao_Paulo' },
        condition: 'hipert',
        organization: { name: 'Clinica Sintetica' },
        summary: {
          caregivers: 2,
          linkedPatients: 3,
          validFollowUps: 5,
          annulledFollowUps: 3,
          absenceAlerts: 3,
          resolvedAlerts: 2,
        },
        caregivers: [
          {
            caregiver: {
              id: CAREGIVER_ID,
              name: 'Cuidador Sintetico',
              status: 'active',
              profile: 'caregiver',
            },
            linkedPatients: 3,
            validFollowUps: 5,
            annulledFollowUps: 1,
            patientsWithFollowUp: 2,
            patientsWithoutFollowUp: 1,
            absenceAlerts: 1,
            resolvedAlerts: 2,
          },
          {
            caregiver: { status: 'inactive', profile: 'family' },
            patientsWithFollowUp: 0,
            patientsWithoutFollowUp: 1,
          },
        ],
      });
      expect(repo.caregiverActivity).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        OCTOBER,
        'hipert',
      );
    });

    it('sem cuidador no periodo: zeros e mensagem', async () => {
      const { data, message } = unwrap<CaregiverActivityReportDto>(await run());

      expect(message).toBe(
        'Nenhuma atividade de cuidador no período selecionado.',
      );
      expect(data.caregivers).toEqual([]);
      expect(data.summary).toEqual({
        caregivers: 0,
        linkedPatients: 0,
        validFollowUps: 0,
        annulledFollowUps: 0,
        absenceAlerts: 0,
        resolvedAlerts: 0,
      });
    });

    it('plano sem o recurso e 403 sem consultar dados', async () => {
      repo.hasManagementReports.mockResolvedValue(false);

      expect(await codeOf(run())).toBe(
        'MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE',
      );
      expectNoDataRead(repo);
    });
  });

  describe('catalogo e recentes', () => {
    it('catalogo lista os tres tipos com as rotas e o total exportado', async () => {
      repo.exportCounts.mockResolvedValue({
        patient_follow_up: 47,
        alerts: 12,
        caregiver_activity: 8,
      });

      const types = await new ListManagementReportTypesUseCase(
        asRepository(repo),
      ).execute(ctx);

      expect(types.map((type: ManagementReportTypeDto) => type.type)).toEqual([
        'patient_follow_up',
        'alerts',
        'caregiver_activity',
      ]);
      expect(types[0]).toMatchObject({
        name: 'Acompanhamento individual',
        path: '/patients/{patientId}/report',
        pdfPath: '/patients/{patientId}/report/pdf',
        formats: ['pdf'],
        exportCount: 47,
      });
      expect(types[1]).toMatchObject({
        name: 'Alertas e intercorrências',
        path: '/management-reports/alerts',
        pdfPath: '/management-reports/alerts/pdf',
        exportCount: 12,
      });
      expect(types[2]).toMatchObject({
        name: 'Atividade dos cuidadores',
        path: '/management-reports/caregivers',
        pdfPath: '/management-reports/caregivers/pdf',
        exportCount: 8,
      });
    });

    it('catalogo sem o recurso do plano e 403', async () => {
      repo.hasManagementReports.mockResolvedValue(false);

      expect(
        await codeOf(
          new ListManagementReportTypesUseCase(asRepository(repo)).execute(ctx),
        ),
      ).toBe('MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE');
      expectNoDataRead(repo);
    });

    it('recentes trazem escopo, periodo, autor e paginacao', async () => {
      repo.recentExports.mockResolvedValue({
        total: 3,
        rows: [
          {
            id: 'e1',
            type: 'alerts',
            patientId: null,
            patientName: null,
            condition: 'DPOC',
            from: '2026-10-01',
            to: '2026-10-31',
            actorId: 'u1',
            actorName: 'Admin Sintetico',
            occurredAt: new Date('2026-11-01T10:00:00.000Z'),
          },
          {
            id: 'e2',
            type: 'caregiver_activity',
            patientId: null,
            patientName: null,
            condition: null,
            from: '2026-10-01',
            to: '2026-10-31',
            actorId: 'u1',
            actorName: 'Admin Sintetico',
            occurredAt: new Date('2026-10-31T10:00:00.000Z'),
          },
          {
            id: 'e3',
            type: 'patient_follow_up',
            patientId: PATIENT_A,
            patientName: 'Paciente Sintetico',
            condition: null,
            from: '2026-09-01',
            to: '2026-09-30',
            actorId: null,
            actorName: null,
            occurredAt: new Date('2026-10-30T10:00:00.000Z'),
          },
        ],
      });

      const { data, pagination, message } = unwrap<RecentReportDto[]>(
        await new ListRecentReportsUseCase(asRepository(repo)).execute(
          { page: 1, limit: 20 },
          ctx,
        ),
      );

      expect(message).toBeUndefined();
      expect(pagination).toEqual({
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
      });
      expect(data).toEqual([
        {
          id: 'e1',
          type: 'alerts',
          scope: { kind: 'condition', patient: null, condition: 'DPOC' },
          period: { from: '2026-10-01', to: '2026-10-31' },
          format: 'pdf',
          generatedBy: { id: 'u1', name: 'Admin Sintetico' },
          generatedAt: '2026-11-01T10:00:00.000Z',
        },
        expect.objectContaining({
          type: 'caregiver_activity',
          scope: { kind: 'all', patient: null, condition: null },
        }),
        expect.objectContaining({
          type: 'patient_follow_up',
          scope: {
            kind: 'patient',
            patient: { id: PATIENT_A, name: 'Paciente Sintetico' },
            condition: null,
          },
          generatedBy: null,
        }),
      ]);
      expect(repo.recentExports).toHaveBeenCalledWith(ORGANIZATION_ID, 1, 20);
    });

    it('sem exportacao: lista vazia com mensagem', async () => {
      const { data, message } = unwrap<RecentReportDto[]>(
        await new ListRecentReportsUseCase(asRepository(repo)).execute(
          { page: 1, limit: 20 },
          ctx,
        ),
      );

      expect(data).toEqual([]);
      expect(message).toBe('Nenhum relatório exportado ainda.');
    });
  });
});
