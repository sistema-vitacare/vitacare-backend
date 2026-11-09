import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';

import { DomainException } from '@/common/errors/domain.exception';
import type { FollowUpDto } from '@/modules/FollowUp/dtos/followUp.dto';
import type { EvolutionSeriesDto } from '@/modules/Indicator/GetPatientEvolution/getPatientEvolution.dto';
import type { MedicationDto } from '@/modules/Medication/dtos/medication.dto';

import type { PatientReportDto } from '../GetPatientReport/getPatientReport.dto';
import {
  DOSE_UNIT_LABELS,
  formatAnswer,
  formatDateTime,
  formatDay,
  formatNumber,
  ROUTE_LABELS,
  toPdfText,
} from '../policies/reportText.policy';
import { ReportErrors } from '../report.errors';

const MARGIN = 50;
const FOOTER_HEIGHT = 30;
const CHART_HEIGHT = 130;
const CHART_LABEL_WIDTH = 50;
const MUTED = '#555555';
const LINE = '#1f6f8b';
const GRID = '#cccccc';

const EMPTY_PERIOD = 'Nenhum registro válido no período.';
const DISCLAIMER =
  'Indicadores calculados sem classificação clínica; não substituem avaliação profissional.';

const SEX_LABELS: Readonly<Record<string, string>> = {
  female: 'Feminino',
  male: 'Masculino',
  other: 'Outro',
};

const INDICATOR_LABELS: Readonly<Record<string, string>> = {
  mean: 'Média',
  variation: 'Variação',
  trend: 'Tendência',
};

const UNAVAILABLE_REASONS: Readonly<
  Record<string, (minimum: number) => string>
> = {
  INSUFFICIENT_SAMPLES: (minimum) =>
    `são necessárias ao menos ${minimum} medições`,
  INSUFFICIENT_TIME_SPAN: () => 'todas as medições no mesmo instante',
};

const DIRECTION_LABELS: Readonly<Record<string, string>> = {
  rising: 'crescente',
  falling: 'decrescente',
  flat: 'nula',
};

type Document = PDFKit.PDFDocument;

/**
 * Relatorio -> PDF (UC10 passo 6). Unico ponto que conhece o `pdfkit`; so le
 * o `PatientReportDto`, entao o PDF nao tem nada alem do que a API devolve.
 */
@Injectable()
export class PatientReportPdfService {
  private readonly logger = new Logger(PatientReportPdfService.name);

  /** Falha da biblioteca vira `REPORT_EXPORT_FAILED`; a causa so vai ao log. */
  async render(report: PatientReportDto): Promise<Buffer> {
    try {
      return await this.draw(report);
    } catch (error) {
      this.logger.error(
        `Falha ao gerar o PDF do relatorio: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new DomainException({
        ...ReportErrors.EXPORT_FAILED,
        detail: null,
      });
    }
  }

  protected draw(report: PatientReportDto): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: MARGIN,
          bottom: MARGIN + FOOTER_HEIGHT,
          left: MARGIN,
          right: MARGIN,
        },
        bufferPages: true,
        info: { Title: 'Relatório do paciente', Producer: 'VitaCare' },
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        writeReport(doc, report);
        writeFooters(doc);
        doc.end();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}

const contentWidth = (doc: Document): number =>
  doc.page.width - doc.page.margins.left - doc.page.margins.right;

const ensureSpace = (doc: Document, height: number): void => {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
};

const write = (
  doc: Document,
  text: string,
  options: { bold?: boolean; size?: number; color?: string } = {},
): void => {
  doc
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(options.size ?? 10)
    .fillColor(options.color ?? 'black')
    .text(toPdfText(text), doc.page.margins.left, doc.y, {
      width: contentWidth(doc),
    });
};

const field = (doc: Document, label: string, value: string): void =>
  write(doc, `${label}: ${value}`);

const heading = (doc: Document, title: string): void => {
  ensureSpace(doc, 60);
  doc.moveDown(0.8);
  write(doc, title, { bold: true, size: 13 });
  doc.moveDown(0.3);
};

const writeReport = (doc: Document, report: PatientReportDto): void => {
  write(doc, report.organization.name, { bold: true, color: MUTED });
  write(doc, 'Relatório do paciente', { bold: true, size: 18 });
  write(
    doc,
    `Período: ${formatDay(report.period.from)} a ${formatDay(report.period.to)} (data da visita, fuso ${report.period.timeZone})`,
  );
  write(
    doc,
    `Gerado em ${formatDateTime(report.generatedAt)} por ${report.generatedBy.name}`,
    { color: MUTED },
  );

  writePatient(doc, report.patient);
  writeSummary(doc, report.records);
  writeSeries(doc, report);
  writeRecords(doc, report.records.items);
  writeMedications(doc, report.medications);
};

const writePatient = (
  doc: Document,
  patient: PatientReportDto['patient'],
): void => {
  heading(doc, 'Identificação do paciente');
  field(doc, 'Nome', patient.name);
  field(doc, 'Data de nascimento', formatDay(patient.birthDate));
  field(doc, 'Sexo', patient.sex ? SEX_LABELS[patient.sex] : 'Não informado');
  field(doc, 'Situação', patient.status === 'active' ? 'Ativo' : 'Inativo');
  field(doc, 'Condição principal', patient.mainCondition ?? 'Não informada');
  if (patient.secondaryConditions.length > 0) {
    field(doc, 'Condições secundárias', patient.secondaryConditions.join(', '));
  }
  field(
    doc,
    'Profissional responsável',
    patient.responsible?.name ?? 'Não definido',
  );
};

const writeSummary = (
  doc: Document,
  records: PatientReportDto['records'],
): void => {
  heading(doc, 'Resumo dos registros');

  if (records.total === 0) {
    write(doc, EMPTY_PERIOD);
    return;
  }

  field(doc, 'Registros válidos', String(records.total));
  field(doc, 'Primeira visita', formatDateTime(records.firstVisitedAt!));
  field(doc, 'Última visita', formatDateTime(records.lastVisitedAt!));
  write(doc, 'Por formulário:', { bold: true });
  for (const form of records.byForm) {
    write(doc, `• ${form.formName}: ${form.total}`);
  }
  write(doc, 'Por autor:', { bold: true });
  for (const author of records.byAuthor) {
    write(doc, `• ${author.name}: ${author.total}`);
  }
  write(doc, 'Registros anulados não entram no relatório.', { color: MUTED });
};

const unitOf = (series: EvolutionSeriesDto): string =>
  series.unit ? ` ${series.unit}` : '';

const writeSeries = (doc: Document, report: PatientReportDto): void => {
  heading(doc, 'Evolução por parâmetro');

  if (report.series.length === 0) {
    write(
      doc,
      report.records.total === 0
        ? EMPTY_PERIOD
        : 'Nenhuma medição numérica no período.',
    );
    return;
  }

  for (const series of report.series) {
    const unit = unitOf(series);
    const { indicators } = series;
    const scale =
      series.fieldType === 'scale'
        ? ` (escala ${formatNumber(series.scaleMin!)} a ${formatNumber(series.scaleMax!)})`
        : series.unit
          ? ` (${series.unit})`
          : '';

    ensureSpace(doc, CHART_HEIGHT + 110);
    doc.moveDown(0.5);
    write(doc, `${series.name}${scale}`, { bold: true, size: 11 });
    write(
      doc,
      `Formulário: ${series.form.name}${series.section ? ` · Seção: ${series.section}` : ''}`,
      { color: MUTED },
    );
    doc.moveDown(0.3);
    drawChart(doc, series);
    write(
      doc,
      `Medições: ${indicators.sampleSize}   Mínimo: ${formatNumber(indicators.min)}${unit}   Máximo: ${formatNumber(indicators.max)}${unit}`,
    );
    write(
      doc,
      [
        indicators.mean !== null &&
          `Média: ${formatNumber(indicators.mean)}${unit}`,
        indicators.variation !== null &&
          `Variação: ${formatNumber(indicators.variation)}${unit}`,
        indicators.trend &&
          `Tendência: ${formatNumber(indicators.trend.slopePerDay)}${unit} por dia (${DIRECTION_LABELS[indicators.trend.direction]})`,
      ]
        .filter(Boolean)
        .join('   '),
    );
    for (const missing of indicators.unavailable) {
      write(
        doc,
        `${INDICATOR_LABELS[missing.indicator]} não calculada: ${UNAVAILABLE_REASONS[missing.reason](missing.minimumSamples)}.`,
        { color: MUTED },
      );
    }
  }
};

/** Linha das medicoes no tempo; escala usa a propria faixa no eixo. */
const drawChart = (doc: Document, series: EvolutionSeriesDto): void => {
  const left = doc.page.margins.left + CHART_LABEL_WIDTH;
  const top = doc.y + 6;
  const width = contentWidth(doc) - CHART_LABEL_WIDTH;
  const values = series.points.map((point) => point.value);
  const times = series.points.map((point) => Date.parse(point.visitedAt));
  let low =
    series.fieldType === 'scale' ? series.scaleMin! : Math.min(...values);
  let high =
    series.fieldType === 'scale' ? series.scaleMax! : Math.max(...values);

  if (low === high) {
    const pad = Math.abs(low) * 0.1 || 1;

    low -= pad;
    high += pad;
  }

  const first = times[0];
  const span = times[times.length - 1] - first;
  const x = (time: number) =>
    span === 0 ? left + width / 2 : left + ((time - first) / span) * width;
  const y = (value: number) =>
    top + CHART_HEIGHT - ((value - low) / (high - low)) * CHART_HEIGHT;

  doc
    .save()
    .lineWidth(0.5)
    .strokeColor(GRID)
    .rect(left, top, width, CHART_HEIGHT)
    .stroke();
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text(formatNumber(high), doc.page.margins.left, top - 4, {
      width: CHART_LABEL_WIDTH - 6,
      align: 'right',
    })
    .text(formatNumber(low), doc.page.margins.left, top + CHART_HEIGHT - 6, {
      width: CHART_LABEL_WIDTH - 6,
      align: 'right',
    });

  doc.lineWidth(1.2).strokeColor(LINE);
  series.points.forEach((point, index) => {
    const px = x(times[index]);
    const py = y(point.value);

    if (index === 0) doc.moveTo(px, py);
    else doc.lineTo(px, py);
  });
  if (series.points.length > 1) doc.stroke();

  doc.fillColor(LINE);
  series.points.forEach((point, index) => {
    doc.circle(x(times[index]), y(point.value), 2.5).fill();
  });
  doc.restore();

  const firstDay = formatDateTime(series.points[0].visitedAt).slice(0, 10);
  const lastDay = formatDateTime(series.points.at(-1)!.visitedAt).slice(0, 10);

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text(firstDay, left, top + CHART_HEIGHT + 3, { width: width / 2 })
    .text(lastDay, left + width / 2, top + CHART_HEIGHT + 3, {
      width: width / 2,
      align: 'right',
    });
  doc.x = doc.page.margins.left;
  doc.y = top + CHART_HEIGHT + 18;
};

const writeRecords = (doc: Document, records: FollowUpDto[]): void => {
  heading(doc, 'Registros do período');

  if (records.length === 0) {
    write(doc, EMPTY_PERIOD);
    return;
  }

  for (const record of records) {
    ensureSpace(doc, 50);
    doc.moveDown(0.4);
    write(
      doc,
      `${formatDateTime(record.visitedAt)} — ${record.form.name} (versão ${record.form.versionNumber}) — ${record.author.name}`,
      { bold: true },
    );
    for (const answer of record.answers) {
      write(doc, `${answer.name}: ${formatAnswer(answer)}`);
    }
    if (record.notes) field(doc, 'Observação', record.notes);
  }
};

const scheduleOf = (medication: MedicationDto): string => {
  const { schedule } = medication;
  const every =
    schedule.intervalDays === 1
      ? 'todos os dias'
      : `a cada ${schedule.intervalDays} dias`;
  const end = schedule.endDate ? formatDay(schedule.endDate) : 'uso contínuo';

  return `Horários: ${schedule.times.join(', ')}, ${every} · Início: ${formatDay(schedule.startDate)} · Fim: ${end}`;
};

const writeMedications = (
  doc: Document,
  medications: MedicationDto[],
): void => {
  heading(doc, 'Medicamentos ativos');

  if (medications.length === 0) {
    write(doc, 'Nenhum medicamento ativo.');
    return;
  }

  for (const medication of medications) {
    ensureSpace(doc, 40);
    doc.moveDown(0.4);
    write(
      doc,
      `${medication.name} — ${formatNumber(medication.doseAmount)} ${DOSE_UNIT_LABELS[medication.doseUnit]}${medication.route ? `, via ${ROUTE_LABELS[medication.route]}` : ''}`,
      { bold: true },
    );
    write(doc, scheduleOf(medication));
    if (medication.notes) field(doc, 'Observação', medication.notes);
  }
};

/** Rodape escrito depois, com o total de paginas ja conhecido. */
const writeFooters = (doc: Document): void => {
  const { start, count } = doc.bufferedPageRange();

  for (let index = start; index < start + count; index += 1) {
    doc.switchToPage(index);

    const bottom = doc.page.margins.bottom;
    const footerY = doc.page.height - MARGIN - FOOTER_HEIGHT / 2;

    // Sem a margem inferior o texto do rodape nao abre pagina nova.
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(toPdfText(DISCLAIMER), MARGIN, footerY, {
        width: contentWidth(doc) - 80,
      })
      .text(`Página ${index + 1} de ${count}`, MARGIN, footerY, {
        width: contentWidth(doc),
        align: 'right',
      });
    doc.page.margins.bottom = bottom;
  }
};
