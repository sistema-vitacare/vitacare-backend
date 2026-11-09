interface PdfJs {
  getDocument(source: { data: Uint8Array; verbosity: number }): {
    promise: Promise<{
      numPages: number;
      getPage(page: number): Promise<{
        getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
      }>;
    }>;
  };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as PdfJs;

/** Texto de cada pagina do PDF, com os trechos separados por espaco. */
export const extractPdfText = async (pdf: Buffer): Promise<string[]> => {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    verbosity: 0,
  }).promise;
  const pages: string[] = [];

  for (let number = 1; number <= doc.numPages; number += 1) {
    const content = await (await doc.getPage(number)).getTextContent();

    pages.push(content.items.map((item) => item.str ?? '').join(' '));
  }

  return pages;
};
