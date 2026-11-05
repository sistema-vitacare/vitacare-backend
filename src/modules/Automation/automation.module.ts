import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AUTOMATION_QUEUE, AutomationProcessor } from './automation.processor';
import { DispatchMedicationRemindersUseCase } from './DispatchMedicationReminders/dispatchMedicationReminders.useCase';
import { FollowUpAbsenceMonitor } from './entities/followUpAbsenceMonitor.entity';
import { AbsenceMonitorRepository } from './repositories/absenceMonitor.repository';
import { MedicationReminderDispatchRepository } from './repositories/medicationReminderDispatch.repository';
import { SweepAbsencesUseCase } from './SweepAbsences/sweepAbsences.useCase';

/**
 * Ausencia de registro e lembretes de medicamento (BE-16). Sem rotas: os
 * eventos entram em `alerts` e saem por `GET /alerts` (modulo Alert).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FollowUpAbsenceMonitor]),
    BullModule.registerQueue({ name: AUTOMATION_QUEUE }),
  ],
  providers: [
    AbsenceMonitorRepository,
    MedicationReminderDispatchRepository,
    SweepAbsencesUseCase,
    DispatchMedicationRemindersUseCase,
    AutomationProcessor,
  ],
})
export class AutomationModule {}
