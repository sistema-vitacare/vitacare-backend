import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

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
import {
  CreateUserDto,
  CreateUserResponseDto,
} from './CreateUser/createUser.dto';
import { CreateUserUseCase } from './CreateUser/createUser.useCase';
import { DeactivateUserUseCase } from './DeactivateUser/deactivateUser.useCase';
import { UserDto, UserInvitationResponseDto } from './dtos/user.dto';
import { GetUserUseCase } from './GetUser/getUser.useCase';
import { ListUsersQueryDto } from './ListUsers/listUsers.dto';
import { ListUsersUseCase } from './ListUsers/listUsers.useCase';
import { ReactivateUserUseCase } from './ReactivateUser/reactivateUser.useCase';
import { ReissueUserInvitationUseCase } from './ReissueUserInvitation/reissueUserInvitation.useCase';
import { UpdateUserDto } from './UpdateUser/updateUser.dto';
import { UpdateUserUseCase } from './UpdateUser/updateUser.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const NOT_FOUND = { status: 404, codes: ['USER_NOT_FOUND'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };
const DUPLICATE = {
  status: 409,
  codes: ['USER_DUPLICATE_EMAIL', 'USER_DUPLICATE_CPF'],
};

@ApiTags('users')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('users')
export class UserController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deactivateUser: DeactivateUserUseCase,
    private readonly reactivateUser: ReactivateUserUseCase,
    private readonly reissueUserInvitation: ReissueUserInvitationUseCase,
    private readonly changeUserProfile: ChangeUserProfileUseCase,
  ) {}

  @Post()
  @RequirePermissions(Permissions.USERS_CREATE)
  @ApiOperation({
    summary:
      'Cadastra um usuario pendente na organizacao da sessao e devolve a senha provisoria do convite.',
  })
  @ApiEnvelope(CreateUserResponseDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    {
      status: 409,
      codes: [
        ...DUPLICATE.codes,
        'USER_PLAN_LIMIT_REACHED',
        'USER_PLAN_EXPIRED',
      ],
    },
    VALIDATION,
  )
  async create(
    @Body() body: CreateUserDto,
    @CurrentContext() ctx: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateUserResponseDto> {
    response.setHeader('Cache-Control', 'no-store');

    return this.createUser.execute(body, ctx);
  }

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

  @Patch(':userId')
  @RequirePermissions(Permissions.USERS_UPDATE)
  @ApiOperation({
    summary: 'Edita nome, e-mail, CPF ou telefone de um usuario do tenant.',
  })
  @ApiEnvelope(UserDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, DUPLICATE, {
    status: 422,
    codes: ['VALIDATION_FAILED', 'USER_NOTHING_TO_UPDATE'],
  })
  async update(
    @Param('userId', UuidParam('userId')) userId: string,
    @Body() body: UpdateUserDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<UserDto> {
    return this.updateUser.execute(userId, body, ctx);
  }

  @Post(':userId/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.USERS_CHANGE_STATUS)
  @ApiOperation({
    summary:
      'Inativa o usuario e revoga na hora as sessoes, os links de recuperacao e o convite pendente.',
  })
  @ApiEnvelope(UserDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    {
      status: 409,
      codes: ['USER_SELF_STATUS_CHANGE', 'USER_ALREADY_INACTIVE'],
    },
    VALIDATION,
  )
  async deactivate(
    @Param('userId', UuidParam('userId')) userId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<UserDto> {
    return this.deactivateUser.execute(userId, ctx);
  }

  @Post(':userId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.USERS_CHANGE_STATUS)
  @ApiOperation({
    summary: 'Reativa o usuario inativo, respeitando o limite do plano.',
  })
  @ApiEnvelope(UserDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    {
      status: 409,
      codes: [
        'USER_SELF_STATUS_CHANGE',
        'USER_ALREADY_ACTIVE',
        'USER_PLAN_LIMIT_REACHED',
        'USER_PLAN_EXPIRED',
      ],
    },
    VALIDATION,
  )
  async reactivate(
    @Param('userId', UuidParam('userId')) userId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<UserDto> {
    return this.reactivateUser.execute(userId, ctx);
  }

  @Post(':userId/invitation')
  @RequirePermissions(Permissions.USERS_CREATE)
  @ApiOperation({
    summary:
      'Reemite o convite de um usuario pendente: nova senha provisoria de 24 h, a anterior deixa de valer.',
  })
  @ApiEnvelope(UserInvitationResponseDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    {
      status: 409,
      codes: ['USER_INVITATION_ALREADY_ACCEPTED', 'USER_INACTIVE'],
    },
    VALIDATION,
  )
  async reissueInvitation(
    @Param('userId', UuidParam('userId')) userId: string,
    @CurrentContext() ctx: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserInvitationResponseDto> {
    response.setHeader('Cache-Control', 'no-store');

    return this.reissueUserInvitation.execute(userId, ctx);
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
