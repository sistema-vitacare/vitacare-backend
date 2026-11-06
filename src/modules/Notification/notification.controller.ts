import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
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

import { CountUnreadNotificationsUseCase } from './CountUnreadNotifications/countUnreadNotifications.useCase';
import {
  NotificationDto,
  PushConfigDto,
  PushSubscriptionCreatedDto,
  ReadAllResultDto,
  UnreadCountDto,
} from './dtos/notification.dto';
import {
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
} from './dtos/notificationPreferences.dto';
import { GetNotificationPreferencesUseCase } from './GetNotificationPreferences/getNotificationPreferences.useCase';
import { GetPushConfigUseCase } from './GetPushConfig/getPushConfig.useCase';
import { ListNotificationsQueryDto } from './ListNotifications/listNotifications.dto';
import { ListNotificationsUseCase } from './ListNotifications/listNotifications.useCase';
import { ReadAllNotificationsDto } from './ReadAllNotifications/readAllNotifications.dto';
import { ReadAllNotificationsUseCase } from './ReadAllNotifications/readAllNotifications.useCase';
import { ReadNotificationUseCase } from './ReadNotification/readNotification.useCase';
import { RegisterPushSubscriptionDto } from './RegisterPushSubscription/registerPushSubscription.dto';
import { RegisterPushSubscriptionUseCase } from './RegisterPushSubscription/registerPushSubscription.useCase';
import { RevokePushSubscriptionDto } from './RevokePushSubscription/revokePushSubscription.dto';
import { RevokePushSubscriptionUseCase } from './RevokePushSubscription/revokePushSubscription.useCase';
import { UpdateNotificationPreferencesUseCase } from './UpdateNotificationPreferences/updateNotificationPreferences.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };

/** Tudo e do proprio usuario da sessao (BE-17, UC13). */
@ApiTags('notifications')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@RequirePermissions(Permissions.ALERTS_READ)
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly countUnread: CountUnreadNotificationsUseCase,
    private readonly readNotification: ReadNotificationUseCase,
    private readonly readAllNotifications: ReadAllNotificationsUseCase,
    private readonly getPreferences: GetNotificationPreferencesUseCase,
    private readonly updatePreferences: UpdateNotificationPreferencesUseCase,
    private readonly getPushConfig: GetPushConfigUseCase,
    private readonly registerPush: RegisterPushSubscriptionUseCase,
    private readonly revokePush: RevokePushSubscriptionUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Caixa interna do usuario: notificacoes de pacientes ao seu alcance, paginadas; mais recentes primeiro.',
  })
  @ApiEnvelope(NotificationDto, { isArray: true })
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, VALIDATION)
  async list(
    @Query() query: ListNotificationsQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<NotificationDto[]>> {
    return this.listNotifications.execute(query, ctx);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Quantas notificacoes da caixa estao nao lidas.' })
  @ApiEnvelope(UnreadCountDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN)
  async unreadCount(
    @CurrentContext() ctx: RequestContext,
  ): Promise<UnreadCountDto> {
    return this.countUnread.execute(ctx);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Marca como lidas todas as notificacoes do usuario, ou so as de um paciente.',
  })
  @ApiEnvelope(ReadAllResultDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, VALIDATION)
  async readAll(
    @Body() body: ReadAllNotificationsDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<ReadAllResultDto> {
    return this.readAllNotifications.execute(body, ctx);
  }

  @Get('preferences')
  @ApiOperation({
    summary:
      'Preferencias de recebimento por origem e canal (padroes quando nunca gravadas).',
  })
  @ApiEnvelope(NotificationPreferencesDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN)
  async preferences(
    @CurrentContext() ctx: RequestContext,
  ): Promise<NotificationPreferencesDto> {
    return this.getPreferences.execute(ctx);
  }

  @Put('preferences')
  @ApiOperation({
    summary:
      'Substitui as preferencias; desligar nao apaga alertas, so deixa de notificar.',
  })
  @ApiEnvelope(NotificationPreferencesDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, {
    status: 422,
    codes: ['VALIDATION_FAILED', 'NOTIFICATION_ORGANIZATION_ALERTS_ADMIN_ONLY'],
  })
  async savePreferences(
    @Body() body: UpdateNotificationPreferencesDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<NotificationPreferencesDto> {
    return this.updatePreferences.execute(body, ctx);
  }

  @Get('push/config')
  @ApiOperation({
    summary:
      'Diz se o push do navegador esta habilitado e devolve a chave publica VAPID.',
  })
  @ApiEnvelope(PushConfigDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN)
  pushConfig(): PushConfigDto {
    return this.getPushConfig.execute();
  }

  @Post('push-subscriptions')
  @ApiOperation({
    summary:
      'Inscreve este navegador no push do usuario; o mesmo endpoint de outro usuario passa para este.',
  })
  @ApiEnvelope(PushSubscriptionCreatedDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 409, codes: ['NOTIFICATION_PUSH_DISABLED'] },
    {
      status: 422,
      codes: ['VALIDATION_FAILED', 'NOTIFICATION_PUSH_ENDPOINT_NOT_ALLOWED'],
    },
  )
  async subscribe(
    @Body() body: RegisterPushSubscriptionDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<PushSubscriptionCreatedDto> {
    return this.registerPush.execute(body, ctx);
  }

  @Post('push-subscriptions/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Para o push neste navegador (chamar antes do logout).',
  })
  @ApiEnvelope(null)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['NOTIFICATION_PUSH_SUBSCRIPTION_NOT_FOUND'] },
    VALIDATION,
  )
  async unsubscribe(
    @Body() body: RevokePushSubscriptionDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<null> {
    return this.revokePush.execute(body, ctx);
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Marca uma notificacao do usuario como lida; repetir mantem a primeira leitura.',
  })
  @ApiEnvelope(NotificationDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['NOTIFICATION_NOT_FOUND'] },
    VALIDATION,
  )
  async read(
    @Param('notificationId', UuidParam('notificationId'))
    notificationId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<NotificationDto> {
    return this.readNotification.execute(notificationId, ctx);
  }
}
