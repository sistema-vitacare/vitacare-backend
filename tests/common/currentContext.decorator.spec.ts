import { UnauthorizedException } from '@nestjs/common';
import { contextFromRequest } from '@/common/context/currentContext.decorator';
import { ProfileCode } from '@/common/context/requestContext.type';

describe('contextFromRequest', () => {
  const valid = {
    context: {
      requestId: 'req-1',
      userId: 'user-1',
      organizationId: 'org-1',
      profile: ProfileCode.PROFESSIONAL,
      permissions: new Set(['patient:read']),
    },
  };

  it('devolve o contexto anexado a requisicao', () => {
    expect(contextFromRequest(valid).organizationId).toBe('org-1');
  });

  it('rejeita requisicao sem contexto autenticado', () => {
    expect(() => contextFromRequest({})).toThrow(UnauthorizedException);
  });

  it('rejeita contexto sem organizacao', () => {
    const semOrg = { context: { ...valid.context, organizationId: '' } };
    expect(() => contextFromRequest(semOrg)).toThrow(UnauthorizedException);
  });
});
