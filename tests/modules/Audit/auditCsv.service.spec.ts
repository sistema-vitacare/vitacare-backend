import { AuditCsvService } from '@/modules/Audit/services/auditCsv.service';
import type { AuditEventRow } from '@/modules/Audit/types/auditEvent.types';

const HEADER =
  'Data/hora;Organização;Usuário;Perfil;Ação;Código da ação;Gravidade;Tipo do item;Id do item;Item;IP;Request id';

const row = (overrides: Partial<AuditEventRow> = {}): AuditEventRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  occurredAt: new Date('2026-10-01T03:00:00.000Z'),
  organizationId: '00000000-0000-4000-8000-0000000000aa',
  organizationName: 'Clinica Exemplo',
  actorType: 'user',
  actorUserId: '00000000-0000-4000-8000-0000000000bb',
  actorName: 'Carla Mendes',
  actorProfileCode: 'admin',
  action: 'user.deactivated',
  severity: 'warning',
  entityType: 'user',
  entityId: '00000000-0000-4000-8000-0000000000cc',
  entityLabel: 'Paulo Lima',
  ipAddress: '192.0.2.10',
  requestId: 'req-1',
  beforeValues: null,
  afterValues: { temporaryPassword: 'nunca-no-csv' },
  ...overrides,
});

const lines = (csv: Buffer): string[] =>
  csv
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .split('\r\n');

describe('CSV da auditoria (BE-23)', () => {
  const service = new AuditCsvService();

  it('comeca com BOM e cabecalho, separado por ponto e virgula', () => {
    const csv = service.render([]);

    expect(csv.toString('utf8').startsWith('\uFEFF')).toBe(true);
    expect(lines(csv)).toEqual([HEADER, '']);
  });

  it('uma linha por evento, com data ISO no fuso local e rotulos', () => {
    expect(lines(service.render([row()]))[1]).toBe(
      '2026-10-01T00:00:00-03:00;Clinica Exemplo;Carla Mendes;Administrador;Inativou usuário;user.deactivated;warning;user;00000000-0000-4000-8000-0000000000cc;Paulo Lima;192.0.2.10;req-1',
    );
  });

  it('evento de sistema sai como Sistema, sem perfil nem IP', () => {
    const [, line] = lines(
      service.render([
        row({
          actorType: 'system',
          actorUserId: null,
          actorName: null,
          actorProfileCode: null,
          ipAddress: null,
          action: 'alert.generated',
          severity: 'critical',
          entityLabel: null,
        }),
      ]),
    );

    expect(line.split(';').slice(2, 4)).toEqual(['Sistema', '']);
    expect(line.split(';')[10]).toBe('');
  });

  it('poe entre aspas valor com separador, aspas ou quebra de linha', () => {
    const [, line] = lines(
      service.render([row({ organizationName: 'Casa "Bem"; Viver\nLtda' })]),
    );

    expect(line).toContain(';"Casa ""Bem""; Viver\nLtda";');
  });

  it.each(['=1+1', '+SOMA(A1)', '-2', '@cmd', '\tx', '\rx'])(
    'neutraliza formula em %p',
    (value) => {
      const csv = service
        .render([row({ entityLabel: value })])
        .toString('utf8');

      expect(csv).toContain(`'${value}`);
      expect(csv).not.toContain(`;${value}`);
      expect(csv).not.toContain(`;"${value}`);
    },
  );

  it('nao inclui valores anteriores/novos', () => {
    expect(service.render([row()]).toString('utf8')).not.toContain(
      'nunca-no-csv',
    );
  });
});
