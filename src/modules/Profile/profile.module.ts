import { Module } from '@nestjs/common';

import { GetOwnProfileUseCase } from './GetOwnProfile/getOwnProfile.useCase';
import { ProfileController } from './profile.controller';
import { OwnProfileRepository } from './repositories/ownProfile.repository';
import { UpdateOwnProfileUseCase } from './UpdateOwnProfile/updateOwnProfile.useCase';

export const PROFILE_USE_CASES = [
  GetOwnProfileUseCase,
  UpdateOwnProfileUseCase,
];

/**
 * Proprio cadastro (BE-27). Depende do `AuthModule` global (identidade, hash de
 * senha e troca de senha), nunca o contrario.
 */
@Module({
  controllers: [ProfileController],
  providers: [...PROFILE_USE_CASES, OwnProfileRepository],
})
export class ProfileModule {}
