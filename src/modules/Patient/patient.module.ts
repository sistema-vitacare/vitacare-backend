import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CreatePatientUseCase } from './CreatePatient/createPatient.useCase';
import { DeactivatePatientUseCase } from './DeactivatePatient/deactivatePatient.useCase';
import { Patient } from './entities/patient.entity';
import { UserPatient } from './entities/userPatient.entity';
import { GetPatientUseCase } from './GetPatient/getPatient.useCase';
import { ListPatientsUseCase } from './ListPatients/listPatients.useCase';
import { PatientController } from './patient.controller';
import { ReactivatePatientUseCase } from './ReactivatePatient/reactivatePatient.useCase';
import { PatientRepository } from './repositories/patient.repository';
import { UpdatePatientUseCase } from './UpdatePatient/updatePatient.useCase';

export const PATIENT_USE_CASES = [
  CreatePatientUseCase,
  ListPatientsUseCase,
  GetPatientUseCase,
  UpdatePatientUseCase,
  DeactivatePatientUseCase,
  ReactivatePatientUseCase,
];

@Module({
  imports: [TypeOrmModule.forFeature([Patient, UserPatient])],
  controllers: [PatientController],
  providers: [...PATIENT_USE_CASES, PatientRepository],
  exports: [PatientRepository],
})
export class PatientModule {}
