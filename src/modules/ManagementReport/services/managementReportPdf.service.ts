import { Injectable, Logger } from '@nestjs/common';

import { DomainException } from '@/common/errors/domain.exception';
import { TENANT_PROFILES } from '@/modules/Access/access.permissions';
import {
  formatDateTime,
  formatDay,
  formatNumber,
} from '@/modules/Report/policies/reportText.policy';

import type { ManagementReportHeaderDto } from '../dtos/managementReport.dto';
import type {
  AlertsReportDto,
  AlertStatusCountsDto,
  IntercurrenceDto,
  ResolutionTimeDto,
  TopAlertPatientDto,
} from '../GetAlertsReport/getAlertsReport.dto';
import type {
  CaregiverActivityDto,
  CaregiverActivityReportDto,
} from '../GetCaregiverActivityReport/getCaregiverActivityReport.dto';
import { ManagementReportErrors } from '../managementReport.errors';
import {
  ALERTS_REPORT_EMPTY_MESSAGE,
  CAREGIVER_REPORT_EMPTY_MESSAGE,
  INTERCURRENCE_LIST_SIZE,
} from '../types/managementReport.types';
import {
  bars,
  type Column,
  COLORS,
  footers,
  header,
  newDocument,
  paragraph,
  section,
  sideBySide,
  table,
  tiles,
} from './pdfLayout';

type Document = PDFKit.PDFDocument;

const FOOTER_NOTE =
  'VitaCare · Relatório gerencial · contagens dos dados registrados, sem classificação clínica';

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  reading: 'Valor fora da regra',
  absence: 'Ausência de registro',
  medication_reminder: 'Lembrete de medicamento',
};

const SEVERITY_LABELS: Readonly<Record<string, string>> = {
  critical: 'Crítico',
  warning: 'Atenção',
  info: 'Informativo',
};

const STATUS_LABELS: Readonly<Record<string, string>> = {
  active: 'Ativo',
  inactive: 'Inativo',
  pending: 'Pendente',
};

const ALERT_STATUS_CHIPS = {
  open: { label: 'Aberto', color: COLORS.warning, tint: COLORS.warningTint },
  resolved: {
    label: 'Resolvido',
    color: COLORS.success,
    tint: COLORS.successTint,
  },
} as const;

const count = (value: number): string => formatNumber(value);

const hours = (value: number | null): string =>
  value === null ? '—' : `${formatNumber(value)} h`;

const shortDay = (day: string): string => formatDay(day).slice(0, 5);

const profileName = (code: string): string =>
  (TENANT_PROFILES as Record<string, { name: string } | undefined>)[code]
    ?.name ?? code;

const metaOf = (report: ManagementReportHeaderDto): string[] => [
  `Período ${formatDay(report.period.from)} a ${formatDay(report.period.to)}`,
  report.condition ? `Condição: ${report.condition}` : 'Todos os pacientes',
  `Gerado em ${formatDateTime(report.generatedAt)}`,
];

/**
 * Relatorios gerenciais -> PDF (BE-30), no visual do sistema. So le os DTOs,
 * entao o PDF nao tem nada alem do que a API devolve em JSON.
 */
@Injectable()
export class ManagementReportPdfService {
  private readonly logger = new Logger(ManagementReportPdfService.name);

  renderAlerts(report: AlertsReportDto): Promise<Buffer> {
    return this.render('Alertas e intercorrências', (doc) =>
      writeAlerts(doc, report),
    );
  }

  renderCaregivers(report: CaregiverActivityReportDto): Promise<Buffer> {
    return this.render('Atividade dos cuidadores', (doc) =>
      writeCaregivers(doc, report),
    );
  }

  /** Falha da biblioteca vira `MANAGEMENT_REPORT_EXPORT_FAILED`; a causa so vai ao log. */
  private async render(
    title: string,
    write: (doc: Document) => void,
  ): Promise<Buffer> {
    try {
      return await this.draw(title, write);
    } catch (error) {
      this.logger.error(
        `Falha ao gerar o PDF do relatorio gerencial: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new DomainException({
        ...ManagementReportErrors.EXPORT_FAILED,
        detail: null,
      });
    }
  }

  protected draw(
    title: string,
    write: (doc: Document) => void,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = newDocument(title);
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        write(doc);
        footers(doc, FOOTER_NOTE);
        doc.end();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}

const statusTable = (
  doc: Document,
  title: string,
  rows: Array<{ label: string; counts: AlertStatusCountsDto }>,
  x: number,
  width: number,
): void => {
  const columns: Column<(typeof rows)[number]>[] = [
    { label: title, width: 0.46, value: (row) => row.label },
    {
      label: 'Total',
      width: 0.18,
      align: 'right',
      value: (row) => count(row.counts.total),
    },
    {
      label: 'Abertos',
      width: 0.18,
      align: 'right',
      value: (row) => count(row.counts.open),
    },
    {
      label: 'Resolvidos',
      width: 0.18,
      align: 'right',
      value: (row) => count(row.counts.resolved),
    },
  ];

  table(doc, columns, rows, { x, width });
};

const writeAlerts = (doc: Document, report: AlertsReportDto): void => {
  header(doc, {
    title: 'Alertas e intercorrências',
    organization: report.organization.name,
    meta: metaOf(report),
  });

  tiles(doc, [
    { label: 'Emitidos', value: count(report.totals.issued) },
    {
      label: 'Abertos',
      value: count(report.totals.open),
      color: COLORS.warning,
    },
    {
      label: 'Resolvidos',
      value: count(report.totals.resolved),
      color: COLORS.success,
    },
    {
      label: 'Intercorrências',
      value: count(report.totals.intercurrences),
      color: COLORS.critical,
    },
  ]);

  if (report.totals.issued === 0) {
    paragraph(doc, ALERTS_REPORT_EMPTY_MESSAGE);
    return;
  }

  paragraph(
    doc,
    'Alertas das três origens emitidos no período, com a situação de agora. Intercorrência é o alerta crítico.',
  );

  section(doc, 'Por origem e severidade', 100);
  sideBySide(
    doc,
    [
      (x, width) =>
        statusTable(
          doc,
          'Origem',
          [
            { label: SOURCE_LABELS.reading, counts: report.bySource.reading },
            { label: SOURCE_LABELS.absence, counts: report.bySource.absence },
            {
              label: SOURCE_LABELS.medication_reminder,
              counts: report.bySource.medicationReminder,
            },
          ],
          x,
          width,
        ),
      (x, width) =>
        statusTable(
          doc,
          'Severidade',
          (['critical', 'warning', 'info'] as const).map((severity) => ({
            label: SEVERITY_LABELS[severity],
            counts: report.bySeverity[severity],
          })),
          x,
          width,
        ),
    ],
    100,
  );

  section(doc, 'Tempo até a resolução', 110);
  const resolutionRows: Array<{ label: string; time: ResolutionTimeDto }> = [
    { label: 'Geral', time: report.resolution.overall },
    ...(['critical', 'warning', 'info'] as const).map((severity) => ({
      label: SEVERITY_LABELS[severity],
      time: report.resolution.bySeverity[severity],
    })),
  ];

  table(
    doc,
    [
      { label: 'Severidade', width: 0.4, value: (row) => row.label },
      {
        label: 'Resolvidos',
        width: 0.2,
        align: 'right',
        value: (row) => count(row.time.resolved),
      },
      {
        label: 'Média',
        width: 0.2,
        align: 'right',
        value: (row) => hours(row.time.averageHours),
      },
      {
        label: 'Mediana',
        width: 0.2,
        align: 'right',
        value: (row) => hours(row.time.medianHours),
      },
    ] satisfies Column<(typeof resolutionRows)[number]>[],
    resolutionRows,
  );

  section(doc, 'Evolução diária', 130);
  bars(
    doc,
    report.byDay.map((day) => ({
      date: day.date,
      total: day.total,
      highlight: day.intercurrences,
    })),
    shortDay,
    { total: 'Alertas emitidos', highlight: 'Intercorrências' },
  );

  section(doc, 'Pacientes com mais alertas');
  table<TopAlertPatientDto>(
    doc,
    [
      { label: 'Paciente', width: 0.44, value: (row) => row.patient.name },
      {
        label: 'Situação',
        width: 0.14,
        value: (row) => STATUS_LABELS[row.patient.status] ?? row.patient.status,
      },
      {
        label: 'Alertas',
        width: 0.14,
        align: 'right',
        value: (row) => count(row.total),
      },
      {
        label: 'Intercorrências',
        width: 0.16,
        align: 'right',
        value: (row) => count(row.intercurrences),
      },
      {
        label: 'Abertos',
        width: 0.12,
        align: 'right',
        value: (row) => count(row.open),
      },
    ],
    report.topPatients,
  );

  section(doc, 'Intercorrências');

  if (report.intercurrences.length === 0) {
    paragraph(doc, 'Nenhuma intercorrência no período.');
    return;
  }
  if (report.intercurrencesTruncated) {
    paragraph(
      doc,
      `As ${INTERCURRENCE_LIST_SIZE} intercorrências mais recentes de ${count(report.totals.intercurrences)} no período.`,
      COLORS.warning,
    );
  }

  table<IntercurrenceDto>(
    doc,
    [
      {
        label: 'Emitido em',
        width: 0.16,
        value: (row) => formatDateTime(row.generatedAt),
      },
      { label: 'Paciente', width: 0.2, value: (row) => row.patient.name },
      {
        label: 'Origem',
        width: 0.22,
        value: (row) => SOURCE_LABELS[row.source] ?? row.source,
        note: (row) => row.subject,
      },
      {
        label: 'Situação',
        width: 0.13,
        value: (row) =>
          ALERT_STATUS_CHIPS[row.status as keyof typeof ALERT_STATUS_CHIPS]
            ?.label ?? row.status,
        chip: (row) =>
          ALERT_STATUS_CHIPS[row.status as keyof typeof ALERT_STATUS_CHIPS] ??
          null,
      },
      {
        label: 'Resolvido em',
        width: 0.17,
        value: (row) => (row.resolvedAt ? formatDateTime(row.resolvedAt) : '—'),
      },
      {
        label: 'Horas',
        width: 0.12,
        align: 'right',
        value: (row) => hours(row.hoursToResolve),
      },
    ],
    report.intercurrences,
  );
};

const writeCaregivers = (
  doc: Document,
  report: CaregiverActivityReportDto,
): void => {
  header(doc, {
    title: 'Atividade dos cuidadores',
    organization: report.organization.name,
    meta: metaOf(report),
  });

  const summary = report.summary;

  tiles(
    doc,
    [
      { label: 'Cuidadores', value: count(summary.caregivers) },
      { label: 'Pacientes vinculados', value: count(summary.linkedPatients) },
      {
        label: 'Registros válidos',
        value: count(summary.validFollowUps),
        color: COLORS.teal,
      },
      { label: 'Registros anulados', value: count(summary.annulledFollowUps) },
      {
        label: 'Alertas de ausência',
        value: count(summary.absenceAlerts),
        color: COLORS.warning,
      },
      {
        label: 'Alertas resolvidos',
        value: count(summary.resolvedAlerts),
        color: COLORS.success,
      },
    ],
    3,
  );

  if (report.caregivers.length === 0) {
    paragraph(doc, CAREGIVER_REPORT_EMPTY_MESSAGE);
    return;
  }

  paragraph(
    doc,
    'Medidas objetivas dos dados registrados no período, sem nota nem classificação. Vinculados = vínculo vigente em algum momento do período.',
  );

  section(doc, 'Por cuidador');
  table<CaregiverActivityDto>(
    doc,
    [
      {
        label: 'Cuidador',
        width: 0.27,
        value: (row) => row.caregiver.name,
        note: (row) =>
          [
            STATUS_LABELS[row.caregiver.status] ?? row.caregiver.status,
            row.caregiver.profile === 'caregiver'
              ? null
              : `perfil atual: ${profileName(row.caregiver.profile)}`,
          ]
            .filter(Boolean)
            .join(' · '),
      },
      {
        label: 'Vinculados',
        width: 0.11,
        align: 'right',
        value: (row) => count(row.linkedPatients),
      },
      {
        label: 'Com registro',
        width: 0.11,
        align: 'right',
        value: (row) => count(row.patientsWithFollowUp),
      },
      {
        label: 'Sem registro',
        width: 0.11,
        align: 'right',
        value: (row) => count(row.patientsWithoutFollowUp),
      },
      {
        label: 'Válidos',
        width: 0.1,
        align: 'right',
        value: (row) => count(row.validFollowUps),
      },
      {
        label: 'Anulados',
        width: 0.1,
        align: 'right',
        value: (row) => count(row.annulledFollowUps),
      },
      {
        label: 'Ausências',
        width: 0.1,
        align: 'right',
        value: (row) => count(row.absenceAlerts),
      },
      {
        label: 'Resolvidos',
        width: 0.1,
        align: 'right',
        value: (row) => count(row.resolvedAlerts),
      },
    ],
    report.caregivers,
  );
};
