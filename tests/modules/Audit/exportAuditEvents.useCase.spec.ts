import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { ExportAuditEventsUseCase } from '@/modules/Audit/ExportAuditEvents/exportAuditEvents.useCase';
import type { AuditEventQueryRepository } from '@/modules/Audit/repositories/auditEventQuery.repository';
import type { AuditCsvService } from '@/modules/Audit/services/auditCsv.service';

import { sessionOf } from '../Patient/patient.fixtures';

const TODAY = '2026-11-09';

describe('exportacao da auditoria (BE-23, UC06 passo 5)', () => {
  const ctx = sessionOf(ProfileCode.ADMIN);
  let repo: jest.Mocked<
    Pick<AuditEventQueryRepository, 'count' | 'listAll' | 'recordExport'>
  >;
  let csv: jest.Mocked<Pick<AuditCsvService, 'render'>>;
  let useCase: ExportAuditEventsUseCase;

  const codeOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return (error as DomainException).code;
    }

    return 'resolved';
  };

  beforeEach(() => {
    repo = {
      count: jest.fn().mockResolvedValue(2),
      listAll: jest.fn().mockResolvedValue([]),
      recordExport: jest.fn().mockResolvedValue(undefined),
    };
    csv = { render: jest.fn().mockReturnValue(Buffer.from('csv')) };
    useCase = new ExportAuditEventsUseCase(
      repo as unknown as AuditEventQueryRepository,
      csv,
    );
  });

  it('gera o CSV, audita sem o termo da busca e entrega como anexo', async () => {
    repo.listAll.mockResolvedValue([{}, {}] as never);

    const file = await useCase.execute(
      {
        from: '2026-10-01',
        to: '2026-10-31',
        action: 'user.deactivated',
        search: 'Maria Silva',
      },
      ctx,
      TODAY,
    );

    expect(repo.recordExport).toHaveBeenCalledWith(ctx, {
      from: '2026-10-01',
      to: '2026-10-31',
      total: 2,
      filters: {
        action: 'user.deactivated',
        severity: null,
        actorUserId: null,
        actorType: null,
        organizationId: ctx.organizationId,
        hasSearch: true,
      },
    });
    expect(JSON.stringify(repo.recordExport.mock.calls)).not.toContain('Maria');
    expect(file.getHeaders()).toMatchObject({
      type: 'text/csv; charset=utf-8',
      disposition:
        'attachment; filename="auditoria-2026-10-01-a-2026-10-31.csv"',
    });
  });

  it('acima do limite responde 422 sem ler os eventos', async () => {
    repo.count.mockResolvedValue(10_001);

    expect(await codeOf(useCase.execute({}, ctx, TODAY))).toBe(
      'AUDIT_EXPORT_TOO_MANY_EVENTS',
    );
    expect(repo.listAll).not.toHaveBeenCalled();
    expect(repo.recordExport).not.toHaveBeenCalled();
  });

  it('exatamente no limite exporta', async () => {
    repo.count.mockResolvedValue(10_000);

    expect(await codeOf(useCase.execute({}, ctx, TODAY))).toBe('resolved');
  });

  it('falha ao gerar responde 500 e nao audita', async () => {
    csv.render.mockImplementation(() => {
      throw new Error('disco cheio');
    });

    expect(await codeOf(useCase.execute({}, ctx, TODAY))).toBe(
      'AUDIT_EXPORT_FAILED',
    );
    expect(repo.recordExport).not.toHaveBeenCalled();
  });

  it('periodo vazio exporta so o cabecalho e audita total zero', async () => {
    repo.count.mockResolvedValue(0);

    await useCase.execute({}, ctx, TODAY);

    expect(repo.listAll).toHaveBeenCalled();
    expect(repo.recordExport.mock.calls[0][1]).toMatchObject({
      from: '2026-10-11',
      to: TODAY,
      total: 0,
    });
  });
});
