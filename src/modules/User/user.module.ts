import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { emailSenderProvider } from '@/modules/Notification/notification.module';

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
import { InvitationIssuer } from './services/invitationIssuer.service';
import { UserInvitationDeliveryService } from './services/userInvitationDelivery.service';
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

/** Envio do convite por e-mail (BE-31), pela porta SMTP do BE-17. */
export const USER_INVITATION_PROVIDERS = [
  InvitationIssuer,
  UserInvitationDeliveryService,
];

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [
    ...USER_USE_CASES,
    ...USER_INVITATION_PROVIDERS,
    UserRepository,
    emailSenderProvider,
  ],
})
export class UserModule {}
