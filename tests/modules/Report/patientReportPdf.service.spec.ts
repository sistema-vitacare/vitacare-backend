import { PatientReportPdfService } from '@/modules/Report/services/patientReportPdf.service';

import { followUpDetail } from '../FollowUp/followUp.fixtures';
import { captureError, patientRow } from '../Patient/patient.fixtures';
import { extractPdfText } from './pdfText';
import { glicemiaPoint, patientReport } from './report.fixtures';

const service = new PatientReportPdfService();

const textOf = async (report: ReturnType<typeof patientReport>) => {
  const pdf = await service.render(report);

  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

  return (await extractPdfText(pdf)).join('\n');
};

describe('PatientReportPdfService', () => {
  it('imprime identificacao, periodo, resumo, indicadores, registros e medicamentos', async () => {
    const text = await textOf(patientReport());

    for (const expected of [
      'Clinica Sintetica',
      'Relatório do paciente',
      'Paciente Sintetico',
      '12/03/1948',
      'Hipertensao arterial',
      '01/10/2026',
      '31/10/2026',
      'Profissional Sintetico',
      'Resumo dos registros',
      'Acompanhamento Geral',
      'Ana Cuidadora',
      'Glicemia capilar',
      'Média',
      '115',
      'Variação',
      '37',
      '2,056',
      'crescente',
      'Registros do período',
      'Sem queixas',
      'Não',
      'Paciente relatou melhora na mobilidade.',
      'Medicamentos ativos',
      'Losartana potassica',
      '50 mg',
      '08:00, 20:00',
      'Página 1 de',
      'sem classificação clínica',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('nao imprime CPF nem endereco do cadastro', async () => {
    const text = await textOf(patientReport());

    expect(text).not.toContain('52998224725');
    expect(text).not.toContain('Avenida Exemplo');
  });

  it('periodo vazio: aviso no lugar de registros e series', async () => {
    const text = await textOf(patientReport({ records: [], points: [] }));

    expect(text).toContain('Nenhum registro válido no período.');
    expect(text).not.toContain('Média');
  });

  it('indicador indisponivel aparece com o motivo', async () => {
    const samples = await textOf(
      patientReport({
        points: [
          glicemiaPoint('105', '2026-10-01T03:00:00.000Z'),
          glicemiaPoint('98', '2026-10-10T03:00:00.000Z'),
        ],
      }),
    );

    expect(samples).toContain('são necessárias ao menos 3 medições');

    const instant = await textOf(
      patientReport({
        points: [1, 2, 3].map((value) =>
          glicemiaPoint(String(value), '2026-10-01T03:00:00.000Z'),
        ),
      }),
    );

    expect(instant).toContain('todas as medições no mesmo instante');
  });

  it('texto fora da fonte nao impede a geracao', async () => {
    const text = await textOf(
      patientReport({ patient: patientRow({ name: 'Ana 🙂 中' }) }),
    );

    expect(text).toContain('Ana ? ?');
  });

  it('muitos registros quebram em varias paginas com rodape', async () => {
    const pages = await extractPdfText(
      await service.render(
        patientReport({
          records: Array.from({ length: 60 }, (_, index) =>
            followUpDetail({ id: `r${index}` }),
          ),
        }),
      ),
    );

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.at(-1)).toContain(`Página ${pages.length} de ${pages.length}`);
  });
});

describe('PatientReportPdfService com falha na geracao', () => {
  class FailingPdfService extends PatientReportPdfService {
    protected draw(): Promise<Buffer> {
      return Promise.reject(new Error('falha sintetica do pdfkit'));
    }
  }

  it('vira 500 REPORT_EXPORT_FAILED sem detalhe tecnico', async () => {
    const error = await captureError(
      new FailingPdfService().render(patientReport()),
    );

    expect(error.code).toBe('REPORT_EXPORT_FAILED');
    expect(error.getStatus()).toBe(500);
    expect(error.detail).toBeNull();
    expect(error.message).toBe(
      'Não foi possível gerar o PDF do relatório. Tente novamente.',
    );
  });
});
