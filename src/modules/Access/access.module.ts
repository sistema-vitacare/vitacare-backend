import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccessController } from './access.controller';
import { AccessProfile } from './entities/accessProfile.entity';
import { Permission } from './entities/permission.entity';
import { ProfilePermission } from './entities/profilePermission.entity';
import { ListAccessProfilesUseCase } from './ListAccessProfiles/listAccessProfiles.useCase';
import { AccessProfileRepository } from './repositories/accessProfile.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessProfile, Permission, ProfilePermission]),
  ],
  controllers: [AccessController],
  providers: [ListAccessProfilesUseCase, AccessProfileRepository],
})
export class AccessModule {}
