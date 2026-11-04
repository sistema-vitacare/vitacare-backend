import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CreateFormUseCase } from './CreateForm/createForm.useCase';
import { FollowUpForm } from './entities/followUpForm.entity';
import { FollowUpFormField } from './entities/followUpFormField.entity';
import { FollowUpFormPatient } from './entities/followUpFormPatient.entity';
import { FollowUpFormVersion } from './entities/followUpFormVersion.entity';
import { FormController } from './form.controller';
import { GetFormUseCase } from './GetForm/getForm.useCase';
import { ListFormsUseCase } from './ListForms/listForms.useCase';
import { FormRepository } from './repositories/form.repository';
import { UpdateFormUseCase } from './UpdateForm/updateForm.useCase';

export const FORM_USE_CASES = [
  CreateFormUseCase,
  ListFormsUseCase,
  GetFormUseCase,
  UpdateFormUseCase,
];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FollowUpForm,
      FollowUpFormVersion,
      FollowUpFormField,
      FollowUpFormPatient,
    ]),
  ],
  controllers: [FormController],
  providers: [...FORM_USE_CASES, FormRepository],
})
export class FormModule {}
