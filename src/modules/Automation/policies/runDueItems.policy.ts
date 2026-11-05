import {
  type DispatchOutcome,
  type DueItem,
  SWEEP_ITEM_LIMIT,
  type SweepCount,
} from '../types/automation.types';

export interface DueItemRunner {
  findDue(limit: number, exclude: string[]): Promise<DueItem[]>;
  dispatch(item: DueItem): Promise<DispatchOutcome>;
  onFailure(item: DueItem, error: unknown): void;
}

/**
 * Despacha os itens pendentes em lotes ate esgotar. Cada item e tentado uma
 * vez por execucao: o que falhou ou bateu o limite de ocorrencias fica para a
 * proxima, sem travar os demais.
 */
export const runDueItems = async (
  runner: DueItemRunner,
): Promise<SweepCount> => {
  const count: SweepCount = { items: 0, alerts: 0, failed: 0 };
  const attempted: string[] = [];

  for (
    let batch = await runner.findDue(SWEEP_ITEM_LIMIT, attempted);
    batch.length > 0;
    batch = await runner.findDue(SWEEP_ITEM_LIMIT, attempted)
  ) {
    for (const item of batch) {
      attempted.push(item.id);

      try {
        const outcome = await runner.dispatch(item);

        if (outcome.kind === 'dispatched') {
          count.items += 1;
          count.alerts += outcome.alerts;
        }
      } catch (error) {
        count.failed += 1;
        runner.onFailure(item, error);
      }
    }
  }

  return count;
};
