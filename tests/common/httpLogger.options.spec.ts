import { Writable } from 'node:stream';
import pino from 'pino';

import {
  buildHttpLoggerOptions,
  monologLevelName,
} from '@/common/http/httpLogger.options';

const capture = () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });

  return { lines, stream };
};

const productionLogger = (stream: Writable) => {
  const { formatters, redact, level } = buildHttpLoggerOptions({
    level: 'info',
    environment: 'production',
  });

  return pino({ formatters, redact, level }, stream);
};

describe('monologLevelName', () => {
  it.each([
    ['trace', 'DEBUG'],
    ['debug', 'DEBUG'],
    ['info', 'INFO'],
    ['warn', 'WARNING'],
    ['error', 'ERROR'],
    ['fatal', 'CRITICAL'],
  ])('%s vira %s', (label, expected) => {
    expect(monologLevelName(label)).toBe(expected);
  });
});

describe('buildHttpLoggerOptions', () => {
  it('em producao grava JSON puro, sem transport', () => {
    expect(
      buildHttpLoggerOptions({ level: 'info', environment: 'production' })
        .transport,
    ).toBeUndefined();
  });

  it('grava level numerico e level_name no padrao lido pelo Alloy', () => {
    const { lines, stream } = capture();

    productionLogger(stream).error('falhou');

    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry.level).toBe(50);
    expect(entry.level_name).toBe('ERROR');
  });

  it('mascara o nome de arquivo do Content-Disposition da resposta', () => {
    const { lines, stream } = capture();

    productionLogger(stream).info(
      {
        req: { headers: { authorization: 'Bearer segredo' } },
        res: {
          headers: {
            'content-disposition': 'attachment; filename="exame-joao.pdf"',
            'content-type': 'application/pdf',
          },
        },
      },
      'request completed',
    );

    const entry = JSON.parse(lines[0]) as {
      req: { headers: Record<string, string> };
      res: { headers: Record<string, string> };
    };
    expect(entry.res.headers['content-disposition']).toBe('[Redacted]');
    expect(entry.res.headers['content-type']).toBe('application/pdf');
    expect(entry.req.headers.authorization).toBe('[Redacted]');
    expect(lines[0]).not.toContain('joao');
    expect(lines[0]).not.toContain('segredo');
  });
});
