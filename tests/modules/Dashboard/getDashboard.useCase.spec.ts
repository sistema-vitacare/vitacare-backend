import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { isEnvelopePayload } from '@/common/http/envelope';
import type { DashboardDto } from '@/modules/Dashboard/GetDashboard/getDashboard.dto';
import { GetDashboardUseCase } from '@/modules/Dashboard/GetDashboard/getDashboard.useCase';
import type { DashboardAlertsDto } from '@/modules/Dashboard/GetDashboardAlerts/getDashboardAlerts.dto';
import type { DashboardFollowUpsDto } from '@/modules/Dashboard/GetDashboardFollowUps/getDashboardFollowUps.dto';
import { GetDashboardAlertsUseCase } from '@/modules/Dashboard/GetDashboardAlerts/getDashboardAlerts.useCase';
import { GetDashboardFollowUpsUseCase } from '@/modules/Dashboard/GetDashboardFollowUps/getDashboardFollowUps.useCase';
import { GetDashboardPatientsUseCase } from '@/modules/Dashboard/GetDashboardPatients/getDashboardPatients.useCase';
import { GetDashboardUsersUseCase } from '@/modules/Dashboard/GetDashboardUsers/getDashboardUsers.useCase';

import { ORGANIZATION_ID, sessionOf } from '../Patient/patient.fixtures';
import {
  asRepository,
  dashboardRepositoryMock,
  type DashboardRepositoryMock,
  LATEST,
} from './dashboard.fixtures';

const ctx = sessionOf(ProfileCode.ADMIN);
const TODAY = '2026-11-09';
const OCTOBER = { from: '2026-10-01', to: '2026-10-30' };
const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' };

const unwrap = <T>(result: unknown) => {
  if (!isEnvelopePayload(result)) throw new Error('esperava envelope');

  return { data: result.data as T, message: result.extras.message };
};

describe('painel operacional (casos de uso)', () => {
  let repo: DashboardRepositoryMock;

  beforeEach(() => {
    repo = dashboardRepositoryMock();
  });

  it('periodo sem registro: zeros, aviso e os numeros que sao foto continuam reais', async () => {
    repo.countAlertsIssued.mockResolvedValue(3);

    const { data, message } = unwrap<DashboardDto>(
      await new GetDashboardUseCase(asRepository(repo)).execute(
        OCTOBER,
        ctx,
        TODAY,
      ),
    );

    expect(message).toBe(
      'Nenhum registro de acompanhamento no período selecionado.',
    );
    expect(data).toMatchObject({
      period: { ...OCTOBER, timeZone: 'America/Sao_Paulo' },
      previousPeriod: SEPTEMBER,
      patients: { active: 4, newInPeriod: 2 },
      users: { active: 6 },
      followUps: { inPeriod: 0, previousPeriodTotal: 0, change: 0 },
      alerts: { issuedInPeriod: 3, pending: 2 },
      latestFollowUps: [],
    });
    expect(data.followUps.byDay).toHaveLength(30);
    expect(
      (data.followUps.byDay as Array<{ total: number }>).every(
        (day) => day.total === 0,
      ),
    ).toBe(true);
  });

  it('com registro nao avisa, calcula a variacao negativa e monta as listas', async () => {
    repo.countFollowUps.mockImplementation(
      (_org: string, period: { from: string }) =>
        Promise.resolve(period.from === OCTOBER.from ? 2 : 5),
    );
    repo.followUpsByDay.mockResolvedValue([{ date: '2026-10-30', total: 2 }]);
    repo.latestFollowUps.mockResolvedValue([LATEST]);

    const { data, message } = unwrap<DashboardDto>(
      await new GetDashboardUseCase(asRepository(repo)).execute(
        OCTOBER,
        ctx,
        TODAY,
      ),
    );

    expect(message).toBeUndefined();
    expect(data.followUps).toMatchObject({
      inPeriod: 2,
      previousPeriodTotal: 5,
      change: -3,
    });
    expect(data.followUps.byDay.at(-1)).toEqual({
      date: '2026-10-30',
      total: 2,
    });
    expect(repo.countFollowUps).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      SEPTEMBER,
    );
    expect(repo.latestFollowUps).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      OCTOBER,
      5,
    );
    expect(repo.priorityAlerts).toHaveBeenCalledWith(ORGANIZATION_ID, 5);
    expect(data.priorityAlerts).toEqual([
      expect.objectContaining({
        source: 'reading',
        patient: { id: LATEST.patientId, name: 'Paciente Sintetico' },
        generatedAt: '2026-10-20T12:00:00.000Z',
        reading: {
          fieldName: 'Saturacao',
          fieldUnit: '%',
          value: '91',
          operator: 'lt',
          referenceValue: 94,
          author: {
            id: '5555555a-0000-4000-8000-00000000000a',
            name: 'Cuidador Sintetico',
          },
        },
      }),
      expect.objectContaining({ source: 'absence', reading: null }),
    ]);
    expect(data.latestFollowUps).toEqual([
      {
        id: LATEST.id,
        patient: { id: LATEST.patientId, name: LATEST.patientName },
        form: { id: LATEST.formId, name: 'Sinais vitais' },
        author: { id: LATEST.authorId, name: 'Cuidador Sintetico' },
        visitedAt: '2026-10-30T13:00:00.000Z',
      },
    ]);
  });

  it('sem periodo usa os ultimos 30 dias ate hoje', async () => {
    const { data } = unwrap<DashboardDto>(
      await new GetDashboardUseCase(asRepository(repo)).execute({}, ctx, TODAY),
    );

    expect(data.period).toMatchObject({ from: '2026-10-11', to: TODAY });
    expect(data.previousPeriod).toEqual({
      from: '2026-09-11',
      to: '2026-10-10',
    });
  });

  it.each([
    [
      'resumo',
      () =>
        new GetDashboardUseCase(asRepository(repo)).execute(
          OCTOBER,
          ctx,
          TODAY,
        ),
    ],
    [
      'pacientes',
      () =>
        new GetDashboardPatientsUseCase(asRepository(repo)).execute(
          OCTOBER,
          ctx,
          TODAY,
        ),
    ],
    [
      'usuarios',
      () => new GetDashboardUsersUseCase(asRepository(repo)).execute(ctx),
    ],
    [
      'registros',
      () =>
        new GetDashboardFollowUpsUseCase(asRepository(repo)).execute(
          OCTOBER,
          ctx,
          TODAY,
        ),
    ],
    [
      'alertas',
      () =>
        new GetDashboardAlertsUseCase(asRepository(repo)).execute(
          OCTOBER,
          ctx,
          TODAY,
        ),
    ],
  ])(
    '%s: plano sem o recurso e 403 sem ler nenhuma contagem',
    async (_name, run) => {
      repo.hasDashboard.mockResolvedValue(false);

      await expect(run()).rejects.toMatchObject({
        code: 'DASHBOARD_PLAN_FEATURE_UNAVAILABLE',
      });
      expect(repo.hasDashboard).toHaveBeenCalledWith(ORGANIZATION_ID);

      const { hasDashboard: _, ...reads } = repo;

      for (const read of Object.values(reads)) {
        expect(read).not.toHaveBeenCalled();
      }
    },
  );

  it('periodo invalido e 422 antes de consultar o plano', async () => {
    await expect(
      new GetDashboardUseCase(asRepository(repo)).execute(
        { from: '2025-01-01', to: '2026-10-30' },
        ctx,
        TODAY,
      ),
    ).rejects.toBeInstanceOf(DomainException);
    expect(repo.hasDashboard).not.toHaveBeenCalled();
  });

  it('falha do banco sobe sem ser engolida', async () => {
    repo.pendingAlerts.mockRejectedValue(new Error('connection lost'));

    await expect(
      new GetDashboardUseCase(asRepository(repo)).execute(OCTOBER, ctx, TODAY),
    ).rejects.toThrow('connection lost');
  });

  it('pacientes: contagens e responsaveis', async () => {
    await expect(
      new GetDashboardPatientsUseCase(asRepository(repo)).execute(
        OCTOBER,
        ctx,
        TODAY,
      ),
    ).resolves.toEqual({
      period: { ...OCTOBER, timeZone: 'America/Sao_Paulo' },
      active: 4,
      inactive: 1,
      newInPeriod: 2,
      byResponsible: [
        {
          professional: {
            id: '4444444a-0000-4000-8000-00000000000a',
            name: 'Prof',
          },
          active: 4,
        },
      ],
    });
  });

  it('usuarios: totais somam os quatro perfis', async () => {
    const result = await new GetDashboardUsersUseCase(
      asRepository(repo),
    ).execute(ctx);

    expect(result).toMatchObject({ active: 6, pending: 1, inactive: 1 });
    expect(result.byProfile.map((row) => row.profile.code)).toEqual([
      'admin',
      'professional',
      'caregiver',
      'family',
    ]);
  });

  it('registros: quebras por formulario e autor, aviso quando vazio', async () => {
    const empty = unwrap(
      await new GetDashboardFollowUpsUseCase(asRepository(repo)).execute(
        OCTOBER,
        ctx,
        TODAY,
      ),
    );

    expect(empty.message).toBe(
      'Nenhum registro de acompanhamento no período selecionado.',
    );

    repo.countFollowUps.mockResolvedValue(3);
    repo.followUpsByForm.mockResolvedValue([
      { id: LATEST.formId, name: 'Sinais vitais', total: 3 },
    ]);
    repo.followUpsByAuthor.mockResolvedValue([
      { id: LATEST.authorId, name: 'Cuidador Sintetico', total: 3 },
    ]);

    const { data, message } = unwrap<DashboardFollowUpsDto>(
      await new GetDashboardFollowUpsUseCase(asRepository(repo)).execute(
        OCTOBER,
        ctx,
        TODAY,
      ),
    );

    expect(message).toBeUndefined();
    expect(data).toMatchObject({
      inPeriod: 3,
      previousPeriodTotal: 3,
      change: 0,
      byForm: [
        { form: { id: LATEST.formId, name: 'Sinais vitais' }, total: 3 },
      ],
      byAuthor: [
        { user: { id: LATEST.authorId, name: 'Cuidador Sintetico' }, total: 3 },
      ],
    });
  });

  it('alertas: emitidos e pendentes separados, aviso proprio quando nao houve emissao', async () => {
    const empty = unwrap<DashboardAlertsDto>(
      await new GetDashboardAlertsUseCase(asRepository(repo)).execute(
        OCTOBER,
        ctx,
        TODAY,
      ),
    );

    expect(empty.message).toBe('Nenhum alerta emitido no período selecionado.');
    expect(empty.data).toMatchObject({
      issuedInPeriod: 0,
      issuedStillOpen: 0,
      pending: { total: 2, bySeverity: { critical: 1, warning: 1, info: 0 } },
    });
    expect(empty.data.byDay).toHaveLength(30);
  });
});
