import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import type { EnvelopePayload } from '@/common/http/envelope';
import { UuidParam } from '@/common/http/uuidParam.pipe';
import { Permissions } from '@/modules/Access/access.permissions';
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import {
  ChangeUserProfileDto,
  ChangeUserProfileResponseDto,
} from './ChangeUserProfile/changeUserProfile.dto';
import { ChangeUserProfileUseCase } from './ChangeUserProfile/changeUserProfile.useCase';
import { UserDto } from './dtos/user.dto';
import { GetUserUseCase } from './GetUser/getUser.useCase';
import { ListUsersQueryDto } from './ListUsers/listUsers.dto';
import { ListUsersUseCase } from './ListUsers/listUsers.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const NOT_FOUND = { status: 404, codes: ['USER_NOT_FOUND'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };

@ApiTags('users')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('users')
export class UserController {
  constructor(
    private readonly listUsers: ListUsersUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly changeUserProfile: ChangeUserProfileUseCase,
  ) {}

  @Get()
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({
    summary: 'Lista os usuarios da organizacao da sessao, paginados.',
  })
  @ApiEnvelope(UserDto, { isArray: true })
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, VALIDATION)
  async list(
    @Query() query: ListUsersQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<UserDto[]>> {
    return this.listUsers.execute(query, ctx);
  }

  @Get(':userId')
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({ summary: 'Consulta um usuario da organizacao da sessao.' })
  @ApiEnvelope(UserDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION)
  async get(
    @Param('userId', UuidParam('userId')) userId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<UserDto> {
    return this.getUser.execute(userId, ctx);
  }

  @Patch(':userId/profile')
  @RequirePermissions(Permissions.USERS_CHANGE_PROFILE)
  @ApiOperation({
    summary: 'Troca o perfil de acesso de um usuario da organizacao da sessao.',
  })
  @ApiEnvelope(ChangeUserProfileResponseDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    { status: 409, codes: ['USER_SELF_PROFILE_CHANGE'] },
    VALIDATION,
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
