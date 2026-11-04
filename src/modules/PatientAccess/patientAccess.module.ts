import { Module } from '@nestjs/common';

import { CreatePatientLinkUseCase } from './CreatePatientLink/createPatientLink.useCase';
import { GetPatientLinkUseCase } from './GetPatientLink/getPatientLink.useCase';
import { ListEligibleUsersUseCase } from './ListEligibleUsers/listEligibleUsers.useCase';
import { ListPatientLinksUseCase } from './ListPatientLinks/listPatientLinks.useCase';
import { PatientAccessController } from './patientAccess.controller';
import { PatientLinkRepository } from './repositories/patientLink.repository';
import { RevokePatientLinkUseCase } from './RevokePatientLink/revokePatientLink.useCase';
import { UpdatePatientLinkUseCase } from './UpdatePatientLink/updatePatientLink.useCase';

export const PATIENT_ACCESS_USE_CASES = [
  CreatePatientLinkUseCase,
  ListPatientLinksUseCase,
  GetPatientLinkUseCase,
  UpdatePatientLinkUseCase,
  RevokePatientLinkUseCase,
  ListEligibleUsersUseCase,
];

/** A entidade `UserPatient` e registrada pelo `PatientModule`. */
@Module({
  controllers: [PatientAccessController],
  providers: [...PATIENT_ACCESS_USE_CASES, PatientLinkRepository],
})
export class PatientAccessModule {}
