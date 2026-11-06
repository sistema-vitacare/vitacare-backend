import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CreateMedicationUseCase } from './CreateMedication/createMedication.useCase';
import { DeactivateMedicationUseCase } from './DeactivateMedication/deactivateMedication.useCase';
import { Medication } from './entities/medication.entity';
import { MedicationReminder } from './entities/medicationReminder.entity';
import { GetMedicationUseCase } from './GetMedication/getMedication.useCase';
import { ListMedicationsUseCase } from './ListMedications/listMedications.useCase';
import { MedicationController } from './medication.controller';
import { ReactivateMedicationUseCase } from './ReactivateMedication/reactivateMedication.useCase';
import { MedicationRepository } from './repositories/medication.repository';
import { UpdateMedicationUseCase } from './UpdateMedication/updateMedication.useCase';

export const MEDICATION_USE_CASES = [
  CreateMedicationUseCase,
  ListMedicationsUseCase,
  GetMedicationUseCase,
  UpdateMedicationUseCase,
  DeactivateMedicationUseCase,
  ReactivateMedicationUseCase,
];

@Module({
  imports: [TypeOrmModule.forFeature([Medication, MedicationReminder])],
  controllers: [MedicationController],
  providers: [...MEDICATION_USE_CASES, MedicationRepository],
  exports: [MedicationRepository],
})
export class MedicationModule {}
