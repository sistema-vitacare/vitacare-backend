import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessProfile } from './entities/accessProfile.entity';
import { Permission } from './entities/permission.entity';
import { ProfilePermission } from './entities/profilePermission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessProfile, Permission, ProfilePermission]),
  ],
})
export class AccessModule {}
