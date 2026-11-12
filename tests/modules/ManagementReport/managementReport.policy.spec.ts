import { DomainException } from '@/common/errors/domain.exception';
import {
  assertAlertVolume,
  assertManagementReportsAvailable,
  toHours,
} from '@/modules/ManagementReport/policies/managementReport.policy';
import { MANAGEMENT_REPORT_MAX_ALERTS } from '@/modules/ManagementReport/types/managementReport.types';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return (error as DomainException).code;
  }

  return undefined;
};

describe('politicas dos relatorios gerenciais', () => {
  it('converte segundos em horas com 3 casas', () => {
    expect(toHours(5400)).toBe(1.5);
    expect(toHours(3600 * 2.123456)).toBe(2.123);
    expect(toHours(1)).toBe(0);
    expect(toHours(0)).toBe(0);
    expect(toHours(null)).toBeNull();
  });

  it('o teto e de 10.000 alertas no periodo', () => {
    expect(MANAGEMENT_REPORT_MAX_ALERTS).toBe(10_000);
    expect(() => assertAlertVolume(10_000)).not.toThrow();
    expect(codeOf(() => assertAlertVolume(10_001))).toBe(
      'MANAGEMENT_REPORT_TOO_MANY_ALERTS',
    );
  });

  it('plano sem management_reports e 403 com codigo proprio', async () => {
    const without = {
      hasManagementReports: jest.fn().mockResolvedValue(false),
    };
    const withFeature = {
      hasManagementReports: jest.fn().mockResolvedValue(true),
    };

    const denied = await assertManagementReportsAvailable(
      without,
      'org-1',
    ).catch((error: DomainException) => error);

    expect(denied).toBeInstanceOf(DomainException);
    expect((denied as DomainException).code).toBe(
      'MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE',
    );
    expect((denied as DomainException).getStatus()).toBe(403);
    await expect(
      assertManagementReportsAvailable(withFeature, 'org-1'),
    ).resolves.toBeUndefined();
    expect(without.hasManagementReports).toHaveBeenCalledWith('org-1');
  });
});
