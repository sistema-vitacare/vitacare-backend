import { ProfileCode } from '@/common/context/requestContext.type';

export interface LoginIdentity {
  userId: string;
  organizationId: string;
  passwordHash: string | null;
  mustChangePassword: boolean;
  status: 'pending' | 'active' | 'inactive';
  deletedAt: Date | null;
  organizationStatus: 'active' | 'inactive';
  organizationDeletedAt: Date | null;
  profile: ProfileCode;
  permissions: ReadonlySet<string>;
}

export interface AuthenticatedPrincipal {
  sessionId: string;
  sessionType: 'normal' | 'password_change';
  userId: string;
  organizationId: string;
  profile: ProfileCode;
  permissions: ReadonlySet<string>;
  absoluteExpiresAt: Date;
}
