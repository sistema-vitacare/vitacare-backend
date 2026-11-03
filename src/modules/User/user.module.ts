import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChangeUserProfileUseCase } from './ChangeUserProfile/changeUserProfile.useCase';
import { CreateUserUseCase } from './CreateUser/createUser.useCase';
import { DeactivateUserUseCase } from './DeactivateUser/deactivateUser.useCase';
import { User } from './entities/user.entity';
import { GetUserUseCase } from './GetUser/getUser.useCase';
import { ListUsersUseCase } from './ListUsers/listUsers.useCase';
import { ReactivateUserUseCase } from './ReactivateUser/reactivateUser.useCase';
import { ReissueUserInvitationUseCase } from './ReissueUserInvitation/reissueUserInvitation.useCase';
import { UpdateUserUseCase } from './UpdateUser/updateUser.useCase';
import { UserRepository } from './repositories/user.repository';
import { UserController } from './user.controller';

export const USER_USE_CASES = [
  CreateUserUseCase,
  ListUsersUseCase,
  GetUserUseCase,
  UpdateUserUseCase,
  DeactivateUserUseCase,
  ReactivateUserUseCase,
  ReissueUserInvitationUseCase,
  ChangeUserProfileUseCase,
];

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [...USER_USE_CASES, UserRepository],
})
export class UserModule {}
