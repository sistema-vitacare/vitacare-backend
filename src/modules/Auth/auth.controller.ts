import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { Public } from './guards/public.decorator';
import { AllowSessionTypes } from './guards/public.decorator';
import { CurrentSessionId } from './guards/currentSessionId.decorator';
import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { CompleteFirstAccessDto } from './CompleteFirstAccess/completeFirstAccess.dto';
import { CompleteFirstAccessUseCase } from './CompleteFirstAccess/completeFirstAccess.useCase';
import { LogoutUseCase } from './Logout/logout.useCase';
import { ChangePasswordDto } from './ChangePassword/changePassword.dto';
import { ChangePasswordUseCase } from './ChangePassword/changePassword.useCase';
import { RequestPasswordRecoveryDto } from './RequestPasswordRecovery/requestPasswordRecovery.dto';
import { RequestPasswordRecoveryUseCase } from './RequestPasswordRecovery/requestPasswordRecovery.useCase';
import { ResetPasswordDto } from './ResetPassword/resetPassword.dto';
import { ResetPasswordUseCase } from './ResetPassword/resetPassword.useCase';
import { ResetUserPasswordAsAdminUseCase } from './ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.useCase';
import { ResetUserPasswordAsAdminResponseDto } from './ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.dto';
import { RequirePermissions } from './guards/requiredPermissions.decorator';
import { LoginDto, LoginResponseDto } from './Login/login.dto';
import { LoginUseCase } from './Login/login.useCase';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly completeFirstAccess: CompleteFirstAccessUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly requestPasswordRecoveryUseCase: RequestPasswordRecoveryUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly resetUserPasswordAsAdminUseCase: ResetUserPasswordAsAdminUseCase,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiEnvelope(LoginResponseDto)
  @ApiErrors(
    { status: 401, codes: ['AUTH_INVALID_CREDENTIALS'] },
    { status: 429, codes: ['AUTH_TEMPORARILY_BLOCKED'] },
    { status: 503, codes: ['AUTH_DEPENDENCY_UNAVAILABLE'] },
  )
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.loginUseCase.execute(body, {
      ip: request.ip || request.socket.remoteAddress || 'unknown',
      requestId: String(request.headers['x-request-id'] ?? ''),
    });
    response.setHeader('Cache-Control', 'no-store');
    return { ...result, expiresAt: result.expiresAt.toISOString() };
  }

  @Post('password/first-access')
  @AllowSessionTypes('password_change')
  @ApiEnvelope(CompleteFirstAccessDto)
  @ApiErrors({ status: 401, codes: ['AUTH_UNAUTHENTICATED'] })
  async firstAccess(
    @Body() body: CompleteFirstAccessDto,
    @CurrentSessionId() sessionId: string,
    @CurrentContext() context: RequestContext,
  ): Promise<null> {
    return this.completeFirstAccess.execute({ ...body, sessionId }, context);
  }

  @Post('logout')
  @AllowSessionTypes('normal', 'password_change')
  @ApiEnvelope(CompleteFirstAccessDto)
  @ApiErrors({ status: 401, codes: ['AUTH_UNAUTHENTICATED'] })
  async logout(@CurrentSessionId() sessionId: string): Promise<null> {
    return this.logoutUseCase.execute(sessionId);
  }

  @Put('password')
  @ApiEnvelope(CompleteFirstAccessDto)
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
    {
      status: 422,
      codes: ['AUTH_CURRENT_PASSWORD_INVALID', 'AUTH_PASSWORD_REUSE'],
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
  @ApiEnvelope(CompleteFirstAccessDto, { status: 202 })
  @ApiErrors(
    { status: 429, codes: ['AUTH_TEMPORARILY_BLOCKED'] },
    { status: 503, codes: ['AUTH_DEPENDENCY_UNAVAILABLE'] },
  )
  async requestPasswordRecovery(
    @Body() body: RequestPasswordRecoveryDto,
    @Req() request: Request,
  ): Promise<null> {
    return this.requestPasswordRecoveryUseCase.execute(body, {
      ip: request.ip || request.socket.remoteAddress || 'unknown',
    });
  }

  @Post('password-recovery/reset')
  @Public()
  @ApiEnvelope(CompleteFirstAccessDto)
  @ApiErrors({ status: 422, codes: ['AUTH_RESET_TOKEN_INVALID_OR_EXPIRED'] })
  async resetPassword(@Body() body: ResetPasswordDto): Promise<null> {
    return this.resetPasswordUseCase.execute(body);
  }

  @Post('users/:userId/temporary-password')
  @RequirePermissions('users:reset_password')
  @ApiEnvelope(ResetUserPasswordAsAdminResponseDto)
  @ApiErrors(
    { status: 404, codes: ['AUTH_USER_NOT_FOUND'] },
    { status: 409, codes: ['AUTH_INVALID_STATE'] },
  )
  async resetUserPasswordAsAdmin(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentContext() context: RequestContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ResetUserPasswordAsAdminResponseDto> {
    response.setHeader('Cache-Control', 'no-store');
    return this.resetUserPasswordAsAdminUseCase.execute({ userId }, context);
  }
}
