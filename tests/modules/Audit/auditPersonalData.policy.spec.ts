import {
  maskForeignPersonalData,
  maskPersonName,
} from '@/modules/Audit/policies/auditPersonalData.policy';
import type { AuditEventRow } from '@/modules/Audit/types/auditEvent.types';

const VIEWER = '00000000-0000-4000-8000-0000000000ff';
const OTHER = '00000000-0000-4000-8000-0000000000aa';

const row = (overrides: Partial<AuditEventRow> = {}): AuditEventRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  occurredAt: new Date('2026-10-01T03:00:00.000Z'),
  organizationId: OTHER,
  organizationName: 'Clinica Exemplo',
  actorType: 'user',
  actorUserId: '00000000-0000-4000-8000-0000000000bb',
  actorName: 'Carla Mendes',
  actorProfileCode: 'professional',
  action: 'patient.created',
  severity: 'normal',
  entityType: 'patient',
  entityId: '00000000-0000-4000-8000-0000000000cc',
  entityLabel: 'Paciente Alfa',
  ipAddress: '192.0.2.10',
  requestId: 'req-1',
  beforeValues: null,
  afterValues: null,
  ...overrides,
});

describe('dados pessoais na auditoria vista pelo master (BE-23)', () => {
  it('mantem a inicial de cada palavra e o tamanho', () => {
    expect(maskPersonName('Paulo Lima')).toBe('P**** L***');
    expect(maskPersonName('Ana  de Souza')).toBe('A**  d* S****');
    expect(maskPersonName('Élida')).toBe('É****');
    expect(maskPersonName('J')).toBe('J');
  });

  it('mascara paciente e responsavel de outra organizacao', () => {
    const masked = maskForeignPersonalData(row(), VIEWER);

    expect(masked.actorName).toBe('C**** M*****');
    expect(masked.entityLabel).toBe('P******* A***');
    expect(masked.organizationName).toBe('Clinica Exemplo');
    expect(masked.ipAddress).toBe('192.0.2.10');
  });

  it('mascara usuario afetado, mas nao organizacao', () => {
    expect(
      maskForeignPersonalData(
        row({ entityType: 'user', entityLabel: 'Paulo Lima' }),
        VIEWER,
      ).entityLabel,
    ).toBe('P**** L***');
    expect(
      maskForeignPersonalData(
        row({ entityType: 'organization', entityLabel: 'Clinica Exemplo' }),
        VIEWER,
      ).entityLabel,
    ).toBe('Clinica Exemplo');
  });

  it('nao toca na organizacao de quem consulta', () => {
    const own = row({ organizationId: VIEWER });

    expect(maskForeignPersonalData(own, VIEWER)).toEqual(own);
  });

  it('nulo continua nulo', () => {
    const masked = maskForeignPersonalData(
      row({ actorName: null, entityLabel: null, actorType: 'system' }),
      VIEWER,
    );

    expect(masked.actorName).toBeNull();
    expect(masked.entityLabel).toBeNull();
  });
});
