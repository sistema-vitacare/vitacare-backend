import { DomainException } from '@/common/errors/domain.exception';
import { ProfileCode } from '@/common/context/requestContext.type';
import {
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
    expect(() => assertPermission(ctx([]), 'a')).toThrow(DomainException);

    let thrown: DomainException | undefined;

    try {
      assertPermission(ctx([]), 'a');
    } catch (error) {
      thrown = error as DomainException;
    }

    expect(thrown?.getStatus()).toBe(403);
    expect(thrown?.code).toBe('AUTH_FORBIDDEN');
    expect(thrown?.detail).toBe('Permissão necessária não concedida à sessão.');
    expect(thrown?.getResponse()).toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });

  it('assertPermission nao lanca quando presente', () => {
    expect(() => assertPermission(ctx(['a']), 'a')).not.toThrow();
  });

  it('familiar so tem permissoes de leitura', () => {
    const familyCodes = TENANT_PROFILES[ProfileCode.FAMILY].permissions;
    const family = ctx([...familyCodes]);

    expect(familyCodes.length).toBeGreaterThan(0);
    for (const code of familyCodes) {
      expect(code.endsWith(':read')).toBe(true);
    }
    for (const code of TENANT_PERMISSION_CODES) {
      if (!code.endsWith(':read')) {
        expect(hasPermission(family, code)).toBe(false);
      }
    }
  });
});
