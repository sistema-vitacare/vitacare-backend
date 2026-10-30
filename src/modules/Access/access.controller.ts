import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentContext } from '@/common/context/currentContext.decorator';
import type { RequestContext } from '@/common/context/requestContext.type';
import { ApiEnvelope } from '@/common/http/apiEnvelope.decorator';
import { ApiErrors } from '@/common/http/apiErrors.decorator';
import { BEARER_SECURITY_SCHEME } from '@/common/http/bearerAuth';
import { RequirePermissions } from '@/modules/Auth/guards/requiredPermissions.decorator';

import { Permissions } from './access.permissions';
import { AccessProfileDto } from './ListAccessProfiles/listAccessProfiles.dto';
import { ListAccessProfilesUseCase } from './ListAccessProfiles/listAccessProfiles.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };

@ApiTags('access-profiles')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('access-profiles')
export class AccessController {
  constructor(private readonly listAccessProfiles: ListAccessProfilesUseCase) {}

  @Get()
  @RequirePermissions(Permissions.ACCESS_PROFILES_READ)
  @ApiOperation({
    summary: 'Lista os perfis de acesso da organizacao e suas permissoes.',
  })
  @ApiEnvelope(AccessProfileDto, { isArray: true })
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN)
  async list(
    @CurrentContext() ctx: RequestContext,
  ): Promise<AccessProfileDto[]> {
    return this.listAccessProfiles.execute(ctx);
  }
}
