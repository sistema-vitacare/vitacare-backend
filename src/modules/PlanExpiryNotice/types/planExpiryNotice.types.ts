import type { PlanExpiryMilestone } from '@/modules/Plan/types/plan.types';

/** Termo corrente com data de fim de organizacao cliente ativa. */
export interface ExpiringTerm {
  termId: string;
  organizationId: string;
  endsAt: Date;
}

export interface NoticeMilestone {
  milestone: PlanExpiryMilestone;
  dueAt: Date;
  validUntil: Date | null;
}

export interface GenerationCount {
  notices: number;
  recipients: number;
  failed: number;
}

export interface NoticeDeliveryCount {
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
  /** Proxima tentativa pendente, para agendar a nova execucao; `null` = nenhuma. */
  nextAttemptAt: Date | null;
}
