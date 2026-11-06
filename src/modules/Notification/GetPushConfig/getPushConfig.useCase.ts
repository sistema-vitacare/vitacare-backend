import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { PushConfigDto } from '../dtos/notification.dto';
import { PUSH_SENDER, type PushSender } from '../channels/pushSender';

/** O service worker do frontend precisa da chave publica para se inscrever. */
@Injectable()
export class GetPushConfigUseCase {
  constructor(
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    private readonly config: ConfigService,
  ) {}

  execute(): PushConfigDto {
    return this.push.enabled
      ? {
          enabled: true,
          publicKey: this.config.getOrThrow<string>(
            'notification.pushPublicKey',
          ),
        }
      : { enabled: false, publicKey: null };
  }
}
