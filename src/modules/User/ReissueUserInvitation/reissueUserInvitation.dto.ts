import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import {
  INVITATION_CHANNELS,
  type InvitationChannel,
} from '../types/user.types';

/** Corpo opcional da reemissao (BE-31); sem `channel`, vale o modo configurado. */
export class ReissueUserInvitationDto {
  @ApiPropertyOptional({
    enum: [...INVITATION_CHANNELS],
    example: 'email',
    description:
      'Canal do convite. Sem o campo: `email` com o SMTP ligado, `temporary_password` com ele desligado. `email` com o SMTP desligado responde 422 `USER_INVITATION_EMAIL_UNAVAILABLE`.',
  })
  @IsOptional()
  @IsIn(INVITATION_CHANNELS, {
    message: 'O canal deve ser email ou temporary_password.',
  })
  channel?: InvitationChannel;
}
