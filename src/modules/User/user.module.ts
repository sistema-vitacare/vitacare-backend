import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChangeUserProfileUseCase } from './ChangeUserProfile/changeUserProfile.useCase';
import { User } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';
import { UserController } from './user.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [ChangeUserProfileUseCase, UserRepository],
})
export class UserModule {}
