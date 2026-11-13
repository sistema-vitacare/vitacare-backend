import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import type { EnvelopePayload } from '@/common/http/envelope';
import { Permissions } from '@/modules/Access/access.permissions';
import {
  AllowPendingTerms,
  Public,
} from '@/modules/Auth/guards/public.decorator';
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import { AcceptTermsUseCase } from './AcceptTerms/acceptTerms.useCase';
import {
  AcceptTermsDto,
  ListTermsAcceptancesQueryDto,
  OwnTermsAcceptanceDto,
  TermsAcceptanceDto,
  TermsAcceptanceItemDto,
} from './dtos/termsAcceptance.dto';
import { ListOwnTermsAcceptancesUseCase } from './ListOwnTermsAcceptances/listOwnTermsAcceptances.useCase';
import { ListTermsAcceptancesUseCase } from './ListTermsAcceptances/listTermsAcceptances.useCase';

import { TermsVersionDto, TermsVersionParamDto } from './dtos/termsVersion.dto';
import { GetCurrentTermsUseCase } from './GetCurrentTerms/getCurrentTerms.useCase';
import { GetTermsVersionUseCase } from './GetTermsVersion/getTermsVersion.useCase';

@ApiTags('terms')
@Controller('terms')
export class TermsController {
  constructor(
    private readonly getCurrentTermsUseCase: GetCurrentTermsUseCase,
    private readonly getTermsVersionUseCase: GetTermsVersionUseCase,
    private readonly acceptTermsUseCase: AcceptTermsUseCase,
    private readonly listOwnTermsAcceptancesUseCase: ListOwnTermsAcceptancesUseCase,
    private readonly listTermsAcceptancesUseCase: ListTermsAcceptancesUseCase,
  ) {}

  @Get('current')
  @Public()
  @ApiOperation({
    summary: 'Termo de uso e privacidade vigente, para exibir antes do aceite.',
  })
  @ApiEnvelope(TermsVersionDto)
  @ApiErrors({ status: 404, codes: ['TERMS_NOT_PUBLISHED'] })
  current(): Promise<TermsVersionDto> {
    return this.getCurrentTermsUseCase.execute();
  }

  @Get('versions/:version')
  @Public()
  @ApiOperation({
    summary: 'Uma versao publicada do termo, inclusive anterior a vigente.',
  })
  @ApiEnvelope(TermsVersionDto)
  @ApiErrors(
    { status: 404, codes: ['TERMS_VERSION_NOT_FOUND'] },
    { status: 422, codes: ['VALIDATION_FAILED'] },
  )
  version(@Param() params: TermsVersionParamDto): Promise<TermsVersionDto> {
    return this.getTermsVersionUseCase.execute(params.version);
  }

  @Post('acceptances')
  @AllowPendingTerms()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth(BEARER_SECURITY_SCHEME)
  @ApiOperation({
    summary:
      'Registra o aceite do termo vigente; repetido devolve o aceite original.',
  })
  @ApiEnvelope(TermsAcceptanceDto)
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
    {
      status: 422,
      codes: ['VALIDATION_FAILED', 'TERMS_VERSION_NOT_CURRENT'],
    },
  )
  accept(
    @Body() body: AcceptTermsDto,
    @CurrentContext() context: RequestContext,
    @Req() request: Request,
  ): Promise<TermsAcceptanceDto> {
    return this.acceptTermsUseCase.execute(
      body,
      context,
      request.headers['user-agent'],
    );
  }

  @Get('acceptances/me')
  @AllowPendingTerms()
  @ApiBearerAuth(BEARER_SECURITY_SCHEME)
  @ApiOperation({
    summary:
      'Aceites do proprio usuario, da versao mais nova para a mais antiga.',
  })
  @ApiEnvelope(OwnTermsAcceptanceDto, { isArray: true })
  @ApiErrors({ status: 401, codes: ['AUTH_UNAUTHENTICATED'] })
  listOwn(
    @CurrentContext() context: RequestContext,
  ): Promise<OwnTermsAcceptanceDto[]> {
    return this.listOwnTermsAcceptancesUseCase.execute(context);
  }

  @Get('acceptances')
  @RequirePermissions(Permissions.AUDIT_EVENTS_READ)
  @ApiBearerAuth(BEARER_SECURITY_SCHEME)
  @ApiOperation({
    summary:
      'Aceites do termo: o admin ve a propria organizacao, o master todas.',
  })
  @ApiEnvelope(TermsAcceptanceItemDto, { isArray: true })
  @ApiErrors(
    { status: 401, codes: ['AUTH_UNAUTHENTICATED'] },
    { status: 403, codes: ['AUTH_FORBIDDEN'] },
    { status: 422, codes: ['VALIDATION_FAILED', 'PERIOD_TOO_LONG'] },
  )
  list(
    @Query() query: ListTermsAcceptancesQueryDto,
    @CurrentContext() context: RequestContext,
  ): Promise<EnvelopePayload<TermsAcceptanceItemDto[]>> {
    return this.listTermsAcceptancesUseCase.execute(query, context);
  }
}
