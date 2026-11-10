import {
  toAuditEventDetailResponse,
  toAuditEventResponse,
} from '@/modules/Audit/parsers/auditEvent.parser';
import type { AuditEventRow } from '@/modules/Audit/types/auditEvent.types';

const row = (overrides: Partial<AuditEventRow> = {}): AuditEventRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  occurredAt: new Date('2026-11-09T12:42:00.000Z'),
  organizationId: '00000000-0000-4000-8000-0000000000aa',
  organizationName: 'Clinica Exemplo',
  actorType: 'user',
  actorUserId: '00000000-0000-4000-8000-0000000000bb',
  actorName: 'Carla Mendes',
  actorProfileCode: 'admin',
  action: 'user.created',
  severity: 'normal',
  entityType: 'user',
  entityId: '00000000-0000-4000-8000-0000000000cc',
  entityLabel: 'Paulo Lima',
  ipAddress: '192.0.2.10',
  requestId: 'req-1',
  beforeValues: null,
  afterValues: null,
  ...overrides,
});

describe('parser da auditoria (BE-23)', () => {
  it('monta autor, perfil, rotulo da acao e item', () => {
    expect(toAuditEventResponse(row())).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      occurredAt: '2026-11-09T12:42:00.000Z',
      organization: {
        id: '00000000-0000-4000-8000-0000000000aa',
        name: 'Clinica Exemplo',
      },
      actor: {
        type: 'user',
        user: {
          id: '00000000-0000-4000-8000-0000000000bb',
          name: 'Carla Mendes',
        },
        profile: { code: 'admin', name: 'Administrador' },
      },
      action: 'user.created',
      actionLabel: 'Cadastrou usuário',
      severity: 'normal',
      entity: {
        type: 'user',
        id: '00000000-0000-4000-8000-0000000000cc',
        label: 'Paulo Lima',
      },
      ipAddress: '192.0.2.10',
      requestId: 'req-1',
    });
  });

  it('evento de sistema sai sem usuario e sem perfil', () => {
    const response = toAuditEventResponse(
      row({
        actorType: 'system',
        actorUserId: null,
        actorName: null,
        actorProfileCode: null,
        ipAddress: null,
      }),
    );

    expect(response.actor).toEqual({
      type: 'system',
      user: null,
      profile: null,
    });
    expect(response.ipAddress).toBeNull();
  });

  it('evento antigo, sem perfil gravado, sai com perfil nulo', () => {
    expect(
      toAuditEventResponse(row({ actorProfileCode: null })).actor.profile,
    ).toBeNull();
  });

  it('o lista nao traz before/after; o detalhe traz', () => {
    const afterValues = { changedFields: ['name'] };

    expect(toAuditEventResponse(row({ afterValues }))).not.toHaveProperty(
      'afterValues',
    );
    expect(toAuditEventDetailResponse(row({ afterValues }))).toMatchObject({
      beforeValues: null,
      afterValues: { changedFields: ['name'] },
    });
  });

  it('mascara chaves sensiveis, inclusive aninhadas', () => {
    const detail = toAuditEventDetailResponse(
      row({
        afterValues: {
          temporaryPassword: 'abc',
          nested: { accessToken: 'x', items: [{ passwordHash: 'h' }] },
          reason: 'first_administrator',
        },
        beforeValues: { clientSecret: 's' },
      }),
    );

    expect(detail.afterValues).toEqual({
      temporaryPassword: '********',
      nested: {
        accessToken: '********',
        items: [{ passwordHash: '********' }],
      },
      reason: 'first_administrator',
    });
    expect(detail.beforeValues).toEqual({ clientSecret: '********' });
  });
});
