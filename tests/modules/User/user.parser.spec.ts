import { maskCpf, toUserResponse } from '@/modules/User/parsers/user.parser';

import { adminCtx, userRow } from './user.fixtures';

describe('user.parser', () => {
  it('mascara o CPF mantendo so os seis digitos do meio', () => {
    expect(maskCpf('12345678909')).toBe('***.456.789-**');
  });

  it('expoe so os campos do contrato, com datas em ISO', () => {
    const response = toUserResponse(
      userRow({ lastAccessAt: new Date('2026-11-03T08:00:00.000Z') }),
      adminCtx,
    );

    expect(response).toEqual({
      id: '2222222a-0000-4000-8000-00000000000a',
      name: 'Usuaria Sintetica',
      email: 'usuaria@example.test',
      cpf: '52998224725',
      phone: null,
      status: 'active',
      profile: { code: 'professional', name: 'Profissional de saude' },
      invitation: null,
      lastAccessAt: '2026-11-03T08:00:00.000Z',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
      deletedAt: null,
    });
  });

  it('mascara o CPF quando pedido', () => {
    expect(toUserResponse(userRow(), adminCtx, { maskCpf: true }).cpf).toBe(
      '***.982.247-**',
    );
  });

  it('descreve o convite pendente dentro do prazo', () => {
    const expiresAt = new Date(Date.now() + 60_000);

    expect(
      toUserResponse(
        userRow({ status: 'pending', temporaryPasswordExpiresAt: expiresAt }),
        adminCtx,
      ).invitation,
    ).toEqual({ status: 'pending', expiresAt: expiresAt.toISOString() });
  });

  it('descreve o convite vencido', () => {
    const expiresAt = new Date(Date.now() - 60_000);

    expect(
      toUserResponse(
        userRow({ status: 'pending', temporaryPasswordExpiresAt: expiresAt }),
        adminCtx,
      ).invitation,
    ).toEqual({ status: 'expired', expiresAt: expiresAt.toISOString() });
  });

  it('nao descreve convite de usuario ativo com senha temporaria administrativa', () => {
    expect(
      toUserResponse(
        userRow({ temporaryPasswordExpiresAt: new Date(Date.now() + 60_000) }),
        adminCtx,
      ).invitation,
    ).toBeNull();
  });
});
