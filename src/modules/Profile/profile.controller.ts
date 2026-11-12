import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Put,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import { Permissions } from '@/modules/Access/access.permissions';
import { ChangePasswordDto } from '@/modules/Auth/ChangePassword/changePassword.dto';
import { ChangePasswordUseCase } from '@/modules/Auth/ChangePassword/changePassword.useCase';
import { SessionProfileDto } from '@/modules/Auth/dtos/sessionProfile.dto';
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import { GetOwnProfileUseCase } from './GetOwnProfile/getOwnProfile.useCase';
import { UpdateOwnProfileDto } from './UpdateOwnProfile/updateOwnProfile.dto';
import { UpdateOwnProfileUseCase } from './UpdateOwnProfile/updateOwnProfile.useCase';

/**
 * Autoatendimento do proprio cadastro (BE-27). Rota no singular: e recurso
 * unico do usuario da sessao, e nenhuma rota recebe id de usuario.
 */
@ApiTags('profile')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly getOwnProfileUseCase: GetOwnProfileUseCase,
    private readonly updateOwnProfileUseCase: UpdateOwnProfileUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
  ) {}

  @Get()
  @RequirePermissions(Permissions.PROFILE_MANAGE)
  @ApiOperation({
    summary: 'Consulta o proprio cadastro: sessao do login com o CPF completo.',
  })
  @ApiEnvelope(SessionProfileDto)
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
    { status: 403, codes: ['AUTH_FORBIDDEN'] },
  )
  async get(
    @CurrentContext() context: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionProfileDto> {
    response.setHeader('Cache-Control', 'no-store');

    return this.getOwnProfileUseCase.execute(context);
  }

  @Patch()
  @RequirePermissions(Permissions.PROFILE_MANAGE)
  @ApiOperation({
    summary:
      'Edita nome, telefone e e-mail do proprio cadastro; trocar o e-mail pede a senha atual.',
  })
  @ApiEnvelope(SessionProfileDto)
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
    { status: 403, codes: ['AUTH_FORBIDDEN'] },
    { status: 409, codes: ['USER_DUPLICATE_EMAIL'] },
    {
      status: 422,
      codes: [
        'VALIDATION_FAILED',
        'PROFILE_NOTHING_TO_UPDATE',
        'PROFILE_CURRENT_PASSWORD_REQUIRED',
        'AUTH_CURRENT_PASSWORD_INVALID',
      ],
    },
  )
  async update(
    @Body() body: UpdateOwnProfileDto,
    @CurrentContext() context: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionProfileDto> {
    response.setHeader('Cache-Control', 'no-store');

    return this.updateOwnProfileUseCase.execute(body, context);
  }

  @Put('password')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permissions.PROFILE_MANAGE)
  @ApiOperation({
    summary:
      'Troca a propria senha e encerra as sessoes do usuario; equivale a PUT /auth/password.',
  })
  @ApiEnvelope(null)
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
    { status: 403, codes: ['AUTH_FORBIDDEN'] },
    {
      status: 422,
      codes: [
        'VALIDATION_FAILED',
        'AUTH_CURRENT_PASSWORD_INVALID',
        'AUTH_PASSWORD_REUSE',
      ],
    },
  )
  async changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentContext() context: RequestContext,
  ): Promise<null> {
    return this.changePasswordUseCase.execute(body, context);
  }
}
