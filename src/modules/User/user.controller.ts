import { Body, Controller, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import { UuidParam } from '@/common/http/uuidParam.pipe';
import { Permissions } from '@/modules/Access/access.permissions';
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import {
  ChangeUserProfileDto,
  ChangeUserProfileResponseDto,
} from './ChangeUserProfile/changeUserProfile.dto';
import { ChangeUserProfileUseCase } from './ChangeUserProfile/changeUserProfile.useCase';

@ApiTags('users')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('users')
export class UserController {
  constructor(private readonly changeUserProfile: ChangeUserProfileUseCase) {}

  @Patch(':userId/profile')
  @RequirePermissions(Permissions.USERS_CHANGE_PROFILE)
  @ApiOperation({
    summary: 'Troca o perfil de acesso de um usuario da organizacao da sessao.',
  })
  @ApiEnvelope(ChangeUserProfileResponseDto)
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
    { status: 403, codes: ['AUTH_FORBIDDEN'] },
    { status: 404, codes: ['USER_NOT_FOUND'] },
    { status: 409, codes: ['USER_SELF_PROFILE_CHANGE'] },
    { status: 422, codes: ['VALIDATION_FAILED'] },
  )
  async changeProfile(
    @Param('userId', UuidParam('userId')) userId: string,
    @Body() body: ChangeUserProfileDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<ChangeUserProfileResponseDto> {
    return this.changeUserProfile.execute(
      { userId, profileCode: body.profileCode },
      ctx,
    );
  }
}
