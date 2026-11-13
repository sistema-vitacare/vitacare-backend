import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { TENANT_PROFILES } from '@/modules/Access/access.permissions';
import type {
  InvitationMailContext,
  UserRow,
} from '@/modules/User/types/user.types';

export const ORGANIZATION_ID = '0000000a-0000-4000-8000-00000000000a';
export const ACTOR_ID = '1111111a-0000-4000-8000-00000000000a';
export const TARGET_ID = '2222222a-0000-4000-8000-00000000000a';

export const adminCtx: RequestContext = {
  requestId: 'req-usuarios',
  userId: ACTOR_ID,
  organizationId: ORGANIZATION_ID,
  organizationKind: 'tenant',
  profile: ProfileCode.ADMIN,
  permissions: new Set(TENANT_PROFILES.admin.permissions),
};

export const userRow = (overrides: Partial<UserRow> = {}): UserRow => ({
  id: TARGET_ID,
  name: 'Usuaria Sintetica',
  email: 'usuaria@example.test',
  cpf: '52998224725',
  phone: null,
  status: 'active',
  profileCode: 'professional',
  profileName: 'Profissional de saude',
  temporaryPasswordExpiresAt: null,
  invitationExpiresAt: null,
  invitationSentAt: null,
  invitationRevokedAt: null,
  lastAccessAt: null,
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  updatedAt: new Date('2026-11-02T10:00:00.000Z'),
  deletedAt: null,
  ...overrides,
});

export const mailContext = (
  overrides: Partial<InvitationMailContext> = {},
): InvitationMailContext => ({
  invitationId: '3333333a-0000-4000-8000-00000000000a',
  userId: TARGET_ID,
  userName: 'Usuaria Sintetica',
  email: 'usuaria@example.test',
  organizationName: 'Casa Exemplo',
  organizationCode: 'casa-exemplo',
  profileName: 'Cuidador',
  inviterName: 'Admin Exemplo',
  ...overrides,
});

/** Porta de envio e servico de canal falsos para os casos de uso. */
export const deliveryMock = (
  options: { smtp?: boolean; status?: 'sent' | 'failed' } = {},
) => ({
  resolveChannel: jest.fn((requested?: 'email' | 'temporary_password') => {
    if (requested === 'email' && !options.smtp) {
      throw new DomainException({
        code: 'USER_INVITATION_EMAIL_UNAVAILABLE',
        status: 422,
        message: 'indisponivel',
      });
    }

    return requested ?? (options.smtp ? 'email' : 'temporary_password');
  }),
  issueToken: jest.fn(() => ({
    raw: 'token-cru',
    hash: 'f'.repeat(64),
    expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
  })),
  deliver: jest.fn().mockResolvedValue(options.status ?? 'sent'),
});

export const captureError = async (
  promise: Promise<unknown>,
): Promise<DomainException> => {
  try {
    await promise;
  } catch (error) {
    return error as DomainException;
  }

  throw new Error('O caso de uso deveria ter falhado.');
};
