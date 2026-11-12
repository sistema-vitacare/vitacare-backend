import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { emailSenderProvider } from '@/modules/Notification/notification.module';

import { DeliverPlanExpiryNoticesUseCase } from './DeliverPlanExpiryNotices/deliverPlanExpiryNotices.useCase';
import { PlanExpiryNotice } from './entities/planExpiryNotice.entity';
import { PlanExpiryNoticeDelivery } from './entities/planExpiryNoticeDelivery.entity';
import { GeneratePlanExpiryNoticesUseCase } from './GeneratePlanExpiryNotices/generatePlanExpiryNotices.useCase';
import {
  PLAN_EXPIRY_NOTICES_QUEUE,
  PlanExpiryNoticeProcessor,
} from './planExpiryNotice.processor';
import { PlanExpiryNoticeRepository } from './repositories/planExpiryNotice.repository';
import { PlanExpiryNoticeDeliveryRepository } from './repositories/planExpiryNoticeDelivery.repository';

/**
 * Aviso de vencimento do plano por e-mail aos administradores (UC04
 * alternativo, BE-28). Sem rota: o aviso na tela e o `expiryWarning` da
 * consulta do plano, e a geracao fica na auditoria.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PlanExpiryNotice, PlanExpiryNoticeDelivery]),
    BullModule.registerQueue({ name: PLAN_EXPIRY_NOTICES_QUEUE }),
  ],
  providers: [
    emailSenderProvider,
    PlanExpiryNoticeRepository,
    PlanExpiryNoticeDeliveryRepository,
    GeneratePlanExpiryNoticesUseCase,
    DeliverPlanExpiryNoticesUseCase,
    PlanExpiryNoticeProcessor,
  ],
})
export class PlanExpiryNoticeModule {}
