import { ProfileCode } from '@/common/context/requestContext.type';
import { toSessionProfileResponse } from '@/modules/Auth/parsers/sessionProfile.parser';
import type { SessionProfileRow } from '@/modules/Auth/types/auth.types';

const row = (
  overrides: Partial<SessionProfileRow> = {},
): SessionProfileRow => ({
  user: {
    id: 'user-1',
    name: 'Ana Exemplo',
    email: 'ana@example.test',
    cpf: '12345678909',
    phone: '(11) 99999-0000',
    status: 'active',
    createdAt: new Date('2026-11-01T12:00:00.000Z'),
  },
  profile: { code: ProfileCode.PROFESSIONAL, name: 'Profissional de saude' },
  permissions: ['patients:read', 'alerts:read', 'profile:manage'],
  organization: {
    id: 'org-1',
    code: 'clinica-a',
    tradeName: 'Clinica A',
    legalName: 'Clinica A Ltda',
    kind: 'tenant',
    status: 'active',
    plan: {
      code: 'enterprise',
      name: 'Enterprise',
      features: ['patient_management', 'operational_dashboard'],
      termStatus: 'active',
    },
  },
  ...overrides,
});

describe('toSessionProfileResponse (BE-27)', () => {
  it('sessao normal: permissoes ordenadas e nome fantasia como nome', () => {
    const session = toSessionProfileResponse(row(), {
      cpf: 'full',
      restricted: false,
    });

    expect(session.permissions).toEqual([
      'alerts:read',
      'patients:read',
      'profile:manage',
    ]);
    expect(session.organization).toMatchObject({
      code: 'clinica-a',
      name: 'Clinica A',
      legalName: 'Clinica A Ltda',
      plan: { features: ['patient_management', 'operational_dashboard'] },
    });
    expect(session.user.createdAt).toBe('2026-11-01T12:00:00.000Z');
  });

  it('CPF mascarado no login e completo no proprio perfil', () => {
    expect(
      toSessionProfileResponse(row(), { cpf: 'masked', restricted: false }).user
        .cpf,
    ).toBe('***.456.789-**');
    expect(
      toSessionProfileResponse(row(), { cpf: 'full', restricted: false }).user
        .cpf,
    ).toBe('12345678909');
  });

  it('sessao restrita mantem identificacao e esvazia permissoes', () => {
    const session = toSessionProfileResponse(
      row({
        user: { ...row().user, status: 'pending' },
      }),
      { cpf: 'masked', restricted: true },
    );

    expect(session.permissions).toEqual([]);
    expect(session.user).toMatchObject({
      name: 'Ana Exemplo',
      status: 'pending',
    });
    expect(session.profile.code).toBe('professional');
  });

  it('plataforma sem plano sai com plan null', () => {
    const session = toSessionProfileResponse(
      row({
        profile: {
          code: ProfileCode.PLATFORM_ADMIN,
          name: 'Administrador master',
        },
        organization: { ...row().organization, kind: 'platform', plan: null },
      }),
      { cpf: 'masked', restricted: false },
    );

    expect(session.organization.kind).toBe('platform');
    expect(session.organization.plan).toBeNull();
  });

  it('termo vencido e telefone ausente passam como estao', () => {
    const session = toSessionProfileResponse(
      row({
        user: { ...row().user, phone: null },
        organization: {
          ...row().organization,
          plan: { ...row().organization.plan!, termStatus: 'expired' },
        },
      }),
      { cpf: 'full', restricted: false },
    );

    expect(session.user.phone).toBeNull();
    expect(session.organization.plan?.termStatus).toBe('expired');
  });

  it('nao muta a linha lida', () => {
    const source = row();

    toSessionProfileResponse(source, { cpf: 'masked', restricted: false });

    expect(source.permissions).toEqual([
      'patients:read',
      'alerts:read',
      'profile:manage',
    ]);
  });
});
