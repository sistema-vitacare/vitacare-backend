import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { resolveRequestId } from '@/common/http/requestId';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import { UuidParam } from '@/common/http/uuidParam.pipe';

import { ChangePasswordDto } from './ChangePassword/changePassword.dto';
import { ChangePasswordUseCase } from './ChangePassword/changePassword.useCase';
import { CompleteFirstAccessDto } from './CompleteFirstAccess/completeFirstAccess.dto';
import { CompleteFirstAccessUseCase } from './CompleteFirstAccess/completeFirstAccess.useCase';
import { CurrentSessionId } from './guards/currentSessionId.decorator';
import { AllowSessionTypes, Public } from './guards/public.decorator';
import { RequirePermissions } from './guards/requiredPermissions.decorator';
import { LoginDto, LoginResponseDto } from './Login/login.dto';
import { LoginUseCase } from './Login/login.useCase';
import { LogoutUseCase } from './Logout/logout.useCase';
import { RequestPasswordRecoveryDto } from './RequestPasswordRecovery/requestPasswordRecovery.dto';
import { RequestPasswordRecoveryUseCase } from './RequestPasswordRecovery/requestPasswordRecovery.useCase';
import { ResetPasswordDto } from './ResetPassword/resetPassword.dto';
import { ResetPasswordUseCase } from './ResetPassword/resetPassword.useCase';
import { ResetUserPasswordAsAdminResponseDto } from './ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.dto';
import { ResetUserPasswordAsAdminUseCase } from './ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.useCase';

/** Endereco do cliente resolvido pelo Express; nunca um header arbitrario. */
const clientIp = (request: Request): string =>
  request.ip ?? request.socket.remoteAddress ?? 'unknown';

/** Mesmo id do envelope e do log, para a sessao criada ficar rastreavel. */
const requestIdOf = (request: Request): string => resolveRequestId(request);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly completeFirstAccessUseCase: CompleteFirstAccessUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly requestPasswordRecoveryUseCase: RequestPasswordRecoveryUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly resetUserPasswordAsAdminUseCase: ResetUserPasswordAsAdminUseCase,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Autentica em uma organizacao e emite o token de sessao.',
  })
  @ApiEnvelope(LoginResponseDto)
  @ApiErrors(
    { status: 401, codes: ['AUTH_INVALID_CREDENTIALS'] },
    { status: 422, codes: ['VALIDATION_FAILED'] },
    { status: 429, codes: ['AUTH_TEMPORARILY_BLOCKED'] },
    { status: 503, codes: ['AUTH_DEPENDENCY_UNAVAILABLE'] },
  )
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.loginUseCase.execute(body, {
      ip: clientIp(request),
      requestId: requestIdOf(request),
    });

    response.setHeader('Cache-Control', 'no-store');

    return { ...result, expiresAt: result.expiresAt.toISOString() };
  }

  @Post('password/first-access')
  @AllowSessionTypes('password_change')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth(BEARER_SECURITY_SCHEME)
  @ApiOperation({
    summary: 'Define a senha definitiva usando a sessao restrita de troca.',
  })
  @ApiEnvelope(null)
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
    { status: 422, codes: ['VALIDATION_FAILED'] },
  )
  async firstAccess(
    @Body() body: CompleteFirstAccessDto,
    @CurrentSessionId() sessionId: string,
    @CurrentContext() context: RequestContext,
  ): Promise<null> {
    return this.completeFirstAccessUseCase.execute(
      { ...body, sessionId },
      context,
    );
  }

  @Post('logout')
  @AllowSessionTypes('normal', 'password_change')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth(BEARER_SECURITY_SCHEME)
  @ApiOperation({ summary: 'Revoga apenas a sessao apresentada.' })
  @ApiEnvelope(null)
  @ApiErrors({ status: 401, codes: ['AUTH_UNAUTHENTICATED'] })
  async logout(
    @CurrentSessionId() sessionId: string,
    @CurrentContext() context: RequestContext,
  ): Promise<null> {
    return this.logoutUseCase.execute(sessionId, context);
  }

  @Put('password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth(BEARER_SECURITY_SCHEME)
  @ApiOperation({
    summary: 'Troca a propria senha e encerra as sessoes do usuario.',
  })
  @ApiEnvelope(null)
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
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

  @Post('password-recovery/request')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Solicita o link de recuperacao sem revelar se a conta existe.',
  })
  @ApiEnvelope(null, { status: HttpStatus.ACCEPTED })
  @ApiErrors(
    { status: 422, codes: ['VALIDATION_FAILED'] },
    { status: 429, codes: ['AUTH_TEMPORARILY_BLOCKED'] },
    { status: 503, codes: ['AUTH_DEPENDENCY_UNAVAILABLE'] },
  )
  async requestPasswordRecovery(
    @Body() body: RequestPasswordRecoveryDto,
    @Req() request: Request,
  ): Promise<null> {
    return this.requestPasswordRecoveryUseCase.execute(body, {
      ip: clientIp(request),
    });
  }

  @Post('password-recovery/reset')
  @Public()
  @ApiOperation({
    summary: 'Consome o token de recuperacao e grava a nova senha.',
  })
  @ApiEnvelope(null, { status: HttpStatus.CREATED })
  @ApiErrors({
    status: 422,
    codes: ['VALIDATION_FAILED', 'AUTH_RESET_TOKEN_INVALID_OR_EXPIRED'],
  })
  async resetPassword(@Body() body: ResetPasswordDto): Promise<null> {
    return this.resetPasswordUseCase.execute(body);
  }

  @Post('users/:userId/temporary-password')
  @RequirePermissions('users:reset_password')
  @ApiBearerAuth(BEARER_SECURITY_SCHEME)
  @ApiOperation({
    summary: 'Emite senha temporaria para um usuario da propria organizacao.',
  })
  @ApiEnvelope(ResetUserPasswordAsAdminResponseDto, {
    status: HttpStatus.CREATED,
  })
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
    { status: 403, codes: ['AUTH_FORBIDDEN'] },
    { status: 404, codes: ['AUTH_USER_NOT_FOUND'] },
    { status: 409, codes: ['AUTH_INVALID_STATE'] },
    { status: 422, codes: ['VALIDATION_FAILED'] },
  )
  async resetUserPasswordAsAdmin(
    @Param('userId', UuidParam('userId')) userId: string,
    @CurrentContext() context: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ResetUserPasswordAsAdminResponseDto> {
    response.setHeader('Cache-Control', 'no-store');

    return this.resetUserPasswordAsAdminUseCase.execute({ userId }, context);
  }
}
