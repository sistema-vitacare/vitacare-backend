import { DomainException } from '@/common/errors/domain.exception';
import { ProfileCode } from '@/common/context/requestContext.type';
import {
  Permissions,
  TENANT_PERMISSION_CODES,
  TENANT_PROFILES,
} from '@/modules/Access/access.permissions';
import {
  assertPermission,
  hasPermission,
} from '@/modules/Access/policies/access.policy';

const ctx = (codes: string[]) => ({ permissions: new Set(codes) });

describe('access.policy', () => {
  it('hasPermission true quando concedida e false quando ausente', () => {
    expect(hasPermission(ctx(['a']), 'a')).toBe(true);
    expect(hasPermission(ctx(['a']), 'b')).toBe(false);
  });

  it('contexto indefinido nega', () => {
    expect(hasPermission(undefined, 'a')).toBe(false);
  });

  it('assertPermission lanca AUTH_FORBIDDEN 403', () => {
    try {
      assertPermission(ctx([]), 'a');
      throw new Error('nao lancou');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainException);
      const e = error as DomainException;
      expect(e.getStatus()).toBe(403);
      expect(JSON.stringify(e.getResponse())).toContain('AUTH_FORBIDDEN');
    }
  });

  it('assertPermission nao lanca quando presente', () => {
    expect(() => assertPermission(ctx(['a']), 'a')).not.toThrow();
  });

  it('familiar so tem permissoes de leitura', () => {
    const family = ctx([...TENANT_PROFILES[ProfileCode.FAMILY].permissions]);
    for (const code of TENANT_PERMISSION_CODES) {
      if (!code.endsWith(':read')) {
        expect(hasPermission(family, code)).toBe(false);
      }
    }
    expect(Permissions).toBeDefined();
  });
});
