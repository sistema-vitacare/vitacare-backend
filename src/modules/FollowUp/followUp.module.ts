import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AlertModule } from '@/modules/Alert/alert.module';

import { AnnulFollowUpUseCase } from './AnnulFollowUp/annulFollowUp.useCase';
import { CreateFollowUpUseCase } from './CreateFollowUp/createFollowUp.useCase';
import { FollowUpRecord } from './entities/followUpRecord.entity';
import { FollowUpResponse } from './entities/followUpResponse.entity';
import { FollowUpResponseItem } from './entities/followUpResponseItem.entity';
import { FollowUpController } from './followUp.controller';
import { GetFollowUpUseCase } from './GetFollowUp/getFollowUp.useCase';
import { ListFollowUpsUseCase } from './ListFollowUps/listFollowUps.useCase';
import { FollowUpRepository } from './repositories/followUp.repository';

export const FOLLOW_UP_USE_CASES = [
  CreateFollowUpUseCase,
  ListFollowUpsUseCase,
  GetFollowUpUseCase,
  AnnulFollowUpUseCase,
];

@Module({
  imports: [
    AlertModule,
    TypeOrmModule.forFeature([
      FollowUpRecord,
      FollowUpResponse,
      FollowUpResponseItem,
    ]),
  ],
  controllers: [FollowUpController],
  providers: [...FOLLOW_UP_USE_CASES, FollowUpRepository],
})
export class FollowUpModule {}
