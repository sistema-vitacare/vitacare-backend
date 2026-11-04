import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CreateFormUseCase } from './CreateForm/createForm.useCase';
import { DeactivateFormUseCase } from './DeactivateForm/deactivateForm.useCase';
import { DiscardFormDraftUseCase } from './DiscardFormDraft/discardFormDraft.useCase';
import { FollowUpForm } from './entities/followUpForm.entity';
import { FollowUpFormField } from './entities/followUpFormField.entity';
import { FollowUpFormPatient } from './entities/followUpFormPatient.entity';
import { FollowUpFormVersion } from './entities/followUpFormVersion.entity';
import { FormController } from './form.controller';
import { GetFormUseCase } from './GetForm/getForm.useCase';
import { ListFormsUseCase } from './ListForms/listForms.useCase';
import { PublishFormUseCase } from './PublishForm/publishForm.useCase';
import { ReactivateFormUseCase } from './ReactivateForm/reactivateForm.useCase';
import { FormRepository } from './repositories/form.repository';
import { SaveFormDraftUseCase } from './SaveFormDraft/saveFormDraft.useCase';
import { UpdateFormUseCase } from './UpdateForm/updateForm.useCase';

export const FORM_USE_CASES = [
  CreateFormUseCase,
  ListFormsUseCase,
  GetFormUseCase,
  UpdateFormUseCase,
  SaveFormDraftUseCase,
  DiscardFormDraftUseCase,
  PublishFormUseCase,
  DeactivateFormUseCase,
  ReactivateFormUseCase,
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
