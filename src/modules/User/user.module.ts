import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChangeUserProfileUseCase } from './ChangeUserProfile/changeUserProfile.useCase';
import { User } from './entities/user.entity';
import { GetUserUseCase } from './GetUser/getUser.useCase';
import { ListUsersUseCase } from './ListUsers/listUsers.useCase';
import { UserRepository } from './repositories/user.repository';
import { UserController } from './user.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [
    ListUsersUseCase,
    GetUserUseCase,
    ChangeUserProfileUseCase,
    UserRepository,
  ],
})
export class UserModule {}
