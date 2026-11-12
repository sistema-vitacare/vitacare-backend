import { ProfileCode } from '@/common/context/requestContext.type';
import type { DomainException } from '@/common/errors/domain.exception';
import { isEnvelopePayload } from '@/common/http/envelope';
import type { AlertsReportDto } from '@/modules/ManagementReport/GetAlertsReport/getAlertsReport.dto';
import { GetAlertsReportUseCase } from '@/modules/ManagementReport/GetAlertsReport/getAlertsReport.useCase';
import type { CaregiverActivityReportDto } from '@/modules/ManagementReport/GetCaregiverActivityReport/getCaregiverActivityReport.dto';
import { GetCaregiverActivityReportUseCase } from '@/modules/ManagementReport/GetCaregiverActivityReport/getCaregiverActivityReport.useCase';
import { ManagementReportPdfService } from '@/modules/ManagementReport/services/managementReportPdf.service';

import { sessionOf } from '../Patient/patient.fixtures';
import { extractPdfText } from '../Report/pdfText';
import {
  alertSummary,
  asRepository,
  caregiverRow,
  EMPTY_SUMMARY,
  intercurrence,
  managementReportRepositoryMock,
  PATIENT_A,
} from './managementReport.fixtures';

const ctx = sessionOf(ProfileCode.ADMIN);
const OCTOBER = { from: '2026-10-01', to: '2026-10-31', condition: 'diab' };
const service = new ManagementReportPdfService();

const dataOf = <T>(result: unknown): T => {
  if (!isEnvelopePayload(result)) throw new Error('esperava envelope');

  return result.data as T;
};

const alertsReport = async (
  setup: (
    repo: ReturnType<typeof managementReportRepositoryMock>,
  ) => void = () => {},
): Promise<AlertsReportDto> => {
  const repo = managementReportRepositoryMock();

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
      source: 'medication_reminder',
      subject: 'Losartana potassica',
      status: 'open',
      resolvedAt: null,
      secondsToResolve: null,
    }),
  ]);
  setup(repo);

  return dataOf<AlertsReportDto>(
    await new GetAlertsReportUseCase(asRepository(repo)).execute(
      OCTOBER,
      ctx,
      '2026-11-12',
    ),
  );
};

const caregiverReport = async (
  rows = [
    caregiverRow(),
    caregiverRow({
      id: '5555555b-0000-4000-8000-00000000000b',
      name: 'Cuidadora Desligada',
      status: 'inactive',
      linkedPatients: 1,
      validFollowUps: 0,
      annulledFollowUps: 2,
      patientsWithFollowUp: 0,
      absenceAlerts: 3,
      resolvedAlerts: 0,
    }),
  ],
): Promise<CaregiverActivityReportDto> => {
  const repo = managementReportRepositoryMock();

  repo.caregiverActivity.mockResolvedValue(rows);
  repo.caregiverSummary.mockResolvedValue({
    linkedPatients: 4,
    absenceAlerts: 4,
  });

  return dataOf<CaregiverActivityReportDto>(
    await new GetCaregiverActivityReportUseCase(asRepository(repo)).execute(
      { from: '2026-10-01', to: '2026-10-31' },
      ctx,
      '2026-11-12',
    ),
  );
};

/** Rotulos saem em caixa alta no PDF: a conferencia ignora maiusculas. */
const textOf = async (pdf: Buffer): Promise<string> => {
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

  return (await extractPdfText(pdf)).join('\n').toLowerCase();
};

const expectAll = (text: string, expected: string[]): void => {
  for (const item of expected) expect(text).toContain(item.toLowerCase());
};

describe('ManagementReportPdfService', () => {
  it('alertas: cabecalho, totais, origens, severidades, tempos, pacientes e intercorrencias', async () => {
    const text = await textOf(await service.renderAlerts(await alertsReport()));

    expectAll(text, [
      'VitaCare',
      'Clinica Sintetica',
      'Alertas e intercorrências',
      '01/10/2026',
      '31/10/2026',
      'diab',
      'Emitidos',
      'Abertos',
      'Resolvidos',
      'Intercorrências',
      'Valor fora da regra',
      'Ausência de registro',
      'Lembrete de medicamento',
      'Crítico',
      'Atenção',
      'Informativo',
      'Tempo até a resolução',
      '1,5',
      'Evolução diária',
      'Pacientes com mais alertas',
      'Paciente Sintetico',
      'Inativo',
      'Glicemia',
      'Losartana potassica',
      'Aberto',
      'Página 1 de',
      'sem classificação clínica',
    ]);
    expect(text).not.toContain('as 200 intercorrências mais recentes');
  });

  it('alertas: lista cortada avisa o total', async () => {
    const report = await alertsReport((repo) =>
      repo.alertSummary.mockResolvedValue(
        alertSummary({
          totals: { total: 400, open: 0, resolved: 400, intercurrences: 250 },
        }),
      ),
    );
    const text = await textOf(await service.renderAlerts(report));

    expect(text).toContain('as 200 intercorrências mais recentes de 250');
  });

  it('alertas: periodo vazio imprime zeros e a mensagem', async () => {
    const report = await alertsReport((repo) => {
      repo.alertSummary.mockResolvedValue(EMPTY_SUMMARY);
      repo.alertsByDay.mockResolvedValue([]);
      repo.topPatients.mockResolvedValue([]);
      repo.intercurrences.mockResolvedValue([]);
    });
    const text = await textOf(await service.renderAlerts(report));

    expect(text).toContain('nenhum alerta emitido no período selecionado.');
    expect(text).not.toContain('pacientes com mais alertas');
  });

  it('cuidadores: resumo e uma linha por cuidador, sem classificacao', async () => {
    const text = await textOf(
      await service.renderCaregivers(await caregiverReport()),
    );

    expectAll(text, [
      'Atividade dos cuidadores',
      'Todos os pacientes',
      'Cuidadores',
      'Pacientes vinculados',
      'Registros válidos',
      'Registros anulados',
      'Alertas de ausência',
      'Alertas resolvidos',
      'Cuidador Sintetico',
      'Cuidadora Desligada',
      'Inativo',
      'Página 1 de',
    ]);
    expect(text).not.toMatch(/eficiência|desempenho|ranking/i);
  });

  it('cuidadores: sem atividade imprime a mensagem', async () => {
    const text = await textOf(
      await service.renderCaregivers(await caregiverReport([])),
    );

    expect(text).toContain(
      'nenhuma atividade de cuidador no período selecionado.',
    );
  });

  it('falha da biblioteca vira MANAGEMENT_REPORT_EXPORT_FAILED sem detalhe', async () => {
    const failing = new ManagementReportPdfService();

    jest
      .spyOn(failing as unknown as { draw: () => Promise<Buffer> }, 'draw')
      .mockRejectedValue(new Error('pdfkit quebrou'));

    const error = (await failing
      .renderAlerts(await alertsReport())
      .catch((caught: unknown) => caught)) as DomainException;

    expect(error.code).toBe('MANAGEMENT_REPORT_EXPORT_FAILED');
    expect(error.detail).toBeNull();
    expect(error.getStatus()).toBe(500);
  });
});
