import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AlertController } from './alert.controller';
import { CreateAlertRuleUseCase } from './CreateAlertRule/createAlertRule.useCase';
import { DeactivateAlertRuleUseCase } from './DeactivateAlertRule/deactivateAlertRule.useCase';
import { Alert } from './entities/alert.entity';
import { AlertRule } from './entities/alertRule.entity';
import {
  ALERTS_QUEUE,
  AlertSweepProcessor,
} from './EvaluateFollowUpAlerts/alertSweep.processor';
import { EvaluateFollowUpAlertsUseCase } from './EvaluateFollowUpAlerts/evaluateFollowUpAlerts.useCase';
import { GetAlertUseCase } from './GetAlert/getAlert.useCase';
import { GetAlertRuleUseCase } from './GetAlertRule/getAlertRule.useCase';
import { ListAlertRulesUseCase } from './ListAlertRules/listAlertRules.useCase';
import { ListAlertsUseCase } from './ListAlerts/listAlerts.useCase';
import { ReactivateAlertRuleUseCase } from './ReactivateAlertRule/reactivateAlertRule.useCase';
import { ResolveAlertUseCase } from './ResolveAlert/resolveAlert.useCase';
import { AlertRepository } from './repositories/alert.repository';
import { AlertRuleRepository } from './repositories/alertRule.repository';
import { UpdateAlertRuleUseCase } from './UpdateAlertRule/updateAlertRule.useCase';

export const ALERT_USE_CASES = [
  CreateAlertRuleUseCase,
  ListAlertRulesUseCase,
  GetAlertRuleUseCase,
  UpdateAlertRuleUseCase,
  DeactivateAlertRuleUseCase,
  ReactivateAlertRuleUseCase,
  ListAlertsUseCase,
  GetAlertUseCase,
  ResolveAlertUseCase,
];

export const ALERT_REPOSITORIES = [AlertRuleRepository, AlertRepository];

/**
 * Regras e alertas por valor registrado (BE-15); resolucao (BE-17). Exporta a avaliacao para o
 * envio do registro de acompanhamento chamar logo apos o commit e a listagem
 * para a visao consolidada do paciente (BE-18).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AlertRule, Alert]),
    BullModule.registerQueue({ name: ALERTS_QUEUE }),
  ],
  controllers: [AlertController],
  providers: [
    ...ALERT_USE_CASES,
    ...ALERT_REPOSITORIES,
    EvaluateFollowUpAlertsUseCase,
    AlertSweepProcessor,
  ],
  exports: [EvaluateFollowUpAlertsUseCase, AlertRepository],
})
export class AlertModule {}
