import { Injectable, Logger } from '@nestjs/common';

import {
  type PlanExpirySchedule,
  planExpiryNoticeMilestone,
  planExpiryNoticeValidUntil,
  planExpirySchedule,
} from '@/modules/Plan/policies/planExpiry.policy';
import type { PlanExpiryMilestone } from '@/modules/Plan/types/plan.types';

import { noticeReference } from '../policies/noticeSchedule.policy';
import { PlanExpiryNoticeRepository } from '../repositories/planExpiryNotice.repository';
import type { GenerationCount } from '../types/planExpiryNotice.types';

const SCHEDULE_KEY: Record<PlanExpiryMilestone, keyof PlanExpirySchedule> = {
  seven_days: 'sevenDays',
  one_day: 'oneDay',
  expired: 'expired',
};

/**
 * Gera o aviso do marco vigente de cada termo perto de vencer ou vencido (UC04
 * alternativo, BE-28), avaliado na 08:00 de Brasilia mais recente. Repetir nao
 * duplica; um termo que falha fica para a execucao seguinte sem travar os
 * demais. O log leva so o id do termo.
 */
@Injectable()
export class GeneratePlanExpiryNoticesUseCase {
  private readonly logger = new Logger(GeneratePlanExpiryNoticesUseCase.name);

  constructor(private readonly notices: PlanExpiryNoticeRepository) {}

  async execute(reference?: Date): Promise<GenerationCount> {
    const at = reference ?? noticeReference(await this.notices.now());
    const count: GenerationCount = { notices: 0, recipients: 0, failed: 0 };

    for (const term of await this.notices.listCandidates(at)) {
      const milestone = planExpiryNoticeMilestone(term.endsAt, at);

      if (!milestone) continue;

      try {
        const generated = await this.notices.generate(term, {
          milestone,
          dueAt: planExpirySchedule(term.endsAt)[SCHEDULE_KEY[milestone]],
          validUntil: planExpiryNoticeValidUntil(term.endsAt, milestone),
        });

        if (generated) {
          count.notices += 1;
          count.recipients += generated.recipients;
        }
      } catch (error) {
        count.failed += 1;
        this.logger.error(
          `Aviso de vencimento do termo ${term.termId} nao gerado; sai na proxima execucao.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return count;
  }
}
