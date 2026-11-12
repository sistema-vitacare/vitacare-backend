import PDFDocument from 'pdfkit';

import { toPdfText } from '@/modules/Report/policies/reportText.policy';

type Document = PDFKit.PDFDocument;

/** Paleta do frontend (`src/styles/theme.js`): navy, teal e tons de estado. */
export const COLORS = {
  navy: '#183058',
  teal: '#0D7D77',
  accent: '#00B69B',
  muted: '#5B6B82',
  surface: '#F3F5F7',
  divider: '#E6E9EE',
  critical: '#B42318',
  criticalTint: '#FEF3F2',
  warning: '#B54708',
  warningTint: '#FFFAEB',
  info: '#175CD3',
  infoTint: '#EFF8FF',
  success: '#067647',
  successTint: '#ECFDF3',
} as const;

export const MARGIN = 48;
const FOOTER_HEIGHT = 28;
const SECTION_GAP = 22;
const ROW_HEIGHT = 20;

const REGULAR = 'Helvetica';
const BOLD = 'Helvetica-Bold';

export interface Tile {
  label: string;
  value: string;
  color?: string;
}

export interface Column<T> {
  label: string;
  /** Fracao da largura util. */
  width: number;
  align?: 'left' | 'right';
  value: (row: T) => string;
  /** Selo colorido no lugar do texto simples. */
  chip?: (row: T) => { color: string; tint: string } | null;
  /** Segunda linha discreta, abaixo do valor. */
  note?: (row: T) => string | null;
}

export interface ReportHeader {
  title: string;
  organization: string;
  meta: string[];
}

export const newDocument = (title: string): Document =>
  new PDFDocument({
    size: 'A4',
    margins: {
      top: MARGIN,
      bottom: MARGIN + FOOTER_HEIGHT,
      left: MARGIN,
      right: MARGIN,
    },
    bufferPages: true,
    info: { Title: title, Producer: 'VitaCare' },
  });

const width = (doc: Document): number =>
  doc.page.width - doc.page.margins.left - doc.page.margins.right;

const left = (doc: Document): number => doc.page.margins.left;

const bottomLimit = (doc: Document): number =>
  doc.page.height - doc.page.margins.bottom;

/** Quebra a pagina se `height` nao cabe; a pagina nova recebe a faixa do topo. */
export const ensureSpace = (doc: Document, height: number): void => {
  if (doc.y + height <= bottomLimit(doc)) return;

  doc.addPage();
  topBand(doc);
  doc.y = doc.page.margins.top + 6;
};

const topBand = (doc: Document): void => {
  doc.rect(0, 0, doc.page.width, 4).fill(COLORS.accent);
};

/** Rotulo em caixa alta, encolhido para caber numa linha da largura dada. */
const label = (
  doc: Document,
  text: string,
  x: number,
  y: number,
  options: PDFKit.Mixins.TextOptions = {},
): void => {
  const content = toPdfText(text.toUpperCase());
  const spacing = 0.4;
  let size = 6.5;

  doc.font(BOLD).fontSize(size);

  if (options.width) {
    // Folga de 8%: o pdfkit quebra antes do limite exato.
    const natural = doc.widthOfString(content) + spacing * content.length;
    const available = options.width * 0.92;

    if (natural > available) {
      size = Math.max(4.5, (size * available) / natural);
      doc.fontSize(size);
    }
  }

  doc.fillColor(COLORS.muted).text(content, x, y + (6.5 - size) / 2, {
    characterSpacing: spacing,
    lineBreak: false,
    ...options,
  });
};

export const header = (doc: Document, content: ReportHeader): void => {
  topBand(doc);

  const x = left(doc);
  const top = doc.page.margins.top - 14;

  doc
    .font(BOLD)
    .fontSize(10)
    .fillColor(COLORS.teal)
    .text('VitaCare', x, top, { lineBreak: false });
  doc
    .font(REGULAR)
    .fontSize(8.5)
    .fillColor(COLORS.muted)
    .text(toPdfText(content.organization), x, top + 1, {
      width: width(doc),
      align: 'right',
      lineBreak: false,
    });

  doc
    .font(BOLD)
    .fontSize(20)
    .fillColor(COLORS.navy)
    .text(toPdfText(content.title), x, top + 24, { width: width(doc) });
  doc.moveDown(0.25);
  doc
    .font(REGULAR)
    .fontSize(8.5)
    .fillColor(COLORS.muted)
    .text(toPdfText(content.meta.join('   ·   ')), x, doc.y, {
      width: width(doc),
    });

  const lineY = doc.y + 10;

  doc
    .moveTo(x, lineY)
    .lineTo(x + width(doc), lineY)
    .lineWidth(0.6)
    .strokeColor(COLORS.divider)
    .stroke();
  doc.y = lineY + 16;
};

/** Blocos de indicador em grade, ate `perRow` por linha. */
export const tiles = (doc: Document, items: Tile[], perRow = 4): void => {
  const gap = 10;
  const height = 54;
  const tileWidth = (width(doc) - gap * (perRow - 1)) / perRow;

  for (let start = 0; start < items.length; start += perRow) {
    ensureSpace(doc, height + gap);

    const y = doc.y;

    items.slice(start, start + perRow).forEach((item, index) => {
      const x = left(doc) + index * (tileWidth + gap);

      doc.roundedRect(x, y, tileWidth, height, 8).fill(COLORS.surface);
      label(doc, item.label, x + 12, y + 11, { width: tileWidth - 24 });
      doc
        .font(BOLD)
        .fontSize(18)
        .fillColor(item.color ?? COLORS.navy)
        .text(toPdfText(item.value), x + 12, y + 24, {
          width: tileWidth - 24,
          lineBreak: false,
        });
    });

    doc.y = y + height + gap;
  }
};

export const section = (doc: Document, title: string, minHeight = 80): void => {
  ensureSpace(doc, SECTION_GAP + minHeight);
  doc.y += SECTION_GAP - 10;

  const y = doc.y;

  doc.rect(left(doc), y + 1, 3, 11).fill(COLORS.teal);
  doc
    .font(BOLD)
    .fontSize(11)
    .fillColor(COLORS.navy)
    .text(toPdfText(title), left(doc) + 10, y, { lineBreak: false });
  doc.y = y + 20;
};

export const paragraph = (
  doc: Document,
  text: string,
  color: string = COLORS.muted,
): void => {
  ensureSpace(doc, 16);
  doc
    .font(REGULAR)
    .fontSize(9)
    .fillColor(color)
    .text(toPdfText(text), left(doc), doc.y, { width: width(doc) });
  doc.y += 6;
};

const tableHeader = <T>(
  doc: Document,
  columns: Column<T>[],
  x: number,
  total: number,
): void => {
  const y = doc.y;
  let cursor = x;

  for (const column of columns) {
    const columnWidth = column.width * total;

    label(doc, column.label, cursor + 3, y, {
      width: columnWidth - 6,
      align: column.align ?? 'left',
    });
    cursor += columnWidth;
  }

  doc
    .moveTo(x, y + 12)
    .lineTo(x + total, y + 12)
    .lineWidth(0.6)
    .strokeColor(COLORS.divider)
    .stroke();
  doc.y = y + 16;
};

const cell = <T>(
  doc: Document,
  column: Column<T>,
  row: T,
  x: number,
  y: number,
  columnWidth: number,
): void => {
  const text = toPdfText(column.value(row));
  const chip = column.chip?.(row);
  const align = column.align ?? 'left';

  if (chip) {
    doc.font(BOLD).fontSize(7.5);

    const chipWidth = doc.widthOfString(text) + 12;
    const chipX = align === 'right' ? x + columnWidth - 4 - chipWidth : x + 4;

    doc.roundedRect(chipX, y + 2, chipWidth, 12, 6).fill(chip.tint);
    doc
      .fillColor(chip.color)
      .text(text, chipX + 6, y + 4.5, { lineBreak: false });

    return;
  }

  doc
    .font(REGULAR)
    .fontSize(8.5)
    .fillColor(COLORS.navy)
    .text(text, x + 4, y + 4, {
      width: columnWidth - 8,
      height: 10,
      align,
      ellipsis: true,
    });

  const note = column.note?.(row);

  if (note) {
    doc
      .font(REGULAR)
      .fontSize(7)
      .fillColor(COLORS.muted)
      .text(toPdfText(note), x + 4, y + 14, {
        width: columnWidth - 8,
        height: 8,
        align,
        ellipsis: true,
      });
  }
};

/** Tabela de linhas simples; repete o cabecalho a cada pagina nova. */
export const table = <T>(
  doc: Document,
  columns: Column<T>[],
  rows: T[],
  options: { x?: number; width?: number; rowHeight?: number } = {},
): void => {
  const x = options.x ?? left(doc);
  const total = options.width ?? width(doc);
  const rowHeight =
    options.rowHeight ??
    (columns.some((column) => column.note !== undefined)
      ? ROW_HEIGHT + 6
      : ROW_HEIGHT);

  ensureSpace(doc, 16 + rowHeight);
  tableHeader(doc, columns, x, total);

  for (const row of rows) {
    if (doc.y + rowHeight > bottomLimit(doc)) {
      ensureSpace(doc, bottomLimit(doc));
      tableHeader(doc, columns, x, total);
    }

    const y = doc.y;
    let cursor = x;

    for (const column of columns) {
      const columnWidth = column.width * total;

      cell(doc, column, row, cursor, y, columnWidth);
      cursor += columnWidth;
    }

    doc
      .moveTo(x, y + rowHeight)
      .lineTo(x + total, y + rowHeight)
      .lineWidth(0.4)
      .strokeColor(COLORS.divider)
      .stroke();
    doc.y = y + rowHeight;
  }
};

/** Duas tabelas lado a lado, alinhadas pelo topo. */
export const sideBySide = (
  doc: Document,
  draw: Array<(x: number, width: number) => void>,
  height: number,
): void => {
  const gap = 18;
  const columnWidth = (width(doc) - gap * (draw.length - 1)) / draw.length;

  ensureSpace(doc, height);

  const top = doc.y;
  let lowest = top;

  draw.forEach((render, index) => {
    doc.y = top;
    render(left(doc) + index * (columnWidth + gap), columnWidth);
    lowest = Math.max(lowest, doc.y);
  });
  doc.y = lowest;
};

export interface Bar {
  date: string;
  total: number;
  highlight: number;
}

/** Barras por dia: total em teal, parte destacada em vermelho. */
export const bars = (
  doc: Document,
  items: Bar[],
  format: (date: string) => string,
  legend: { total: string; highlight: string },
): void => {
  const chartHeight = 90;

  ensureSpace(doc, chartHeight + 40);

  const x = left(doc);
  const chartWidth = width(doc);
  const top = doc.y + 4;
  const max = Math.max(1, ...items.map((item) => item.total));
  const slot = chartWidth / Math.max(1, items.length);
  const barWidth = Math.max(0.8, Math.min(14, slot * 0.65));
  const base = top + chartHeight;

  doc
    .moveTo(x, base)
    .lineTo(x + chartWidth, base)
    .lineWidth(0.6)
    .strokeColor(COLORS.divider)
    .stroke();

  items.forEach((item, index) => {
    const barX = x + index * slot + (slot - barWidth) / 2;
    const totalHeight = (item.total / max) * chartHeight;
    const highlightHeight = (item.highlight / max) * chartHeight;

    if (totalHeight > 0) {
      doc
        .rect(barX, base - totalHeight, barWidth, totalHeight)
        .fill(COLORS.accent);
    }
    if (highlightHeight > 0) {
      doc
        .rect(barX, base - highlightHeight, barWidth, highlightHeight)
        .fill(COLORS.critical);
    }
  });

  doc
    .font(REGULAR)
    .fontSize(7)
    .fillColor(COLORS.muted)
    .text(String(max), x, top - 4, { lineBreak: false });

  if (items.length > 0) {
    doc.text(toPdfText(format(items[0].date)), x, base + 4, {
      lineBreak: false,
    });
    doc.text(toPdfText(format(items[items.length - 1].date)), x, base + 4, {
      width: chartWidth,
      align: 'right',
      lineBreak: false,
    });
  }

  const legendY = base + 16;

  doc.rect(x, legendY + 1, 7, 7).fill(COLORS.accent);
  doc
    .font(REGULAR)
    .fontSize(7.5)
    .fillColor(COLORS.muted)
    .text(toPdfText(legend.total), x + 11, legendY, { lineBreak: false });
  doc.rect(x + 90, legendY + 1, 7, 7).fill(COLORS.critical);
  doc.text(toPdfText(legend.highlight), x + 101, legendY, {
    lineBreak: false,
  });
  doc.y = legendY + 14;
};

/** Rodape de todas as paginas: aviso a esquerda, paginacao a direita. */
export const footers = (doc: Document, note: string): void => {
  const { start, count } = doc.bufferedPageRange();

  for (let index = start; index < start + count; index += 1) {
    doc.switchToPage(index);

    const bottom = doc.page.margins.bottom;
    const y = doc.page.height - MARGIN - 6;
    const x = left(doc);

    // Sem margem inferior durante o rodape: texto ali nao abre pagina nova.
    doc.page.margins.bottom = 0;
    doc
      .moveTo(x, y - 8)
      .lineTo(x + width(doc), y - 8)
      .lineWidth(0.6)
      .strokeColor(COLORS.divider)
      .stroke();
    doc
      .font(REGULAR)
      .fontSize(7)
      .fillColor(COLORS.muted)
      .text(toPdfText(note), x, y, {
        width: width(doc) - 80,
        lineBreak: false,
      });
    doc.text(`Página ${index - start + 1} de ${count}`, x, y, {
      width: width(doc),
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = bottom;
  }
};
