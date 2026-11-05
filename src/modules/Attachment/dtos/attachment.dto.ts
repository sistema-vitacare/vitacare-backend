import { ApiProperty } from '@nestjs/swagger';

import { UserRefDto } from '@/modules/FollowUp/dtos/followUp.dto';

import {
  ATTACHMENT_CONTENT_TYPES,
  ATTACHMENT_MAX_BYTES,
} from '../types/attachment.types';

export class AttachmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'Registro de acompanhamento.' })
  followUpId!: string;

  @ApiProperty({
    maxLength: 255,
    example: 'curativo-perna.jpg',
    description:
      'Nome original saneado (sem diretorio nem caractere de controle). So rotulo.',
  })
  fileName!: string;

  @ApiProperty({
    enum: ATTACHMENT_CONTENT_TYPES,
    description: 'Tipo detectado pelo conteudo do arquivo.',
  })
  contentType!: string;

  @ApiProperty({
    minimum: 1,
    maximum: ATTACHMENT_MAX_BYTES,
    example: 482133,
    description: 'Tamanho em bytes.',
  })
  sizeBytes!: number;

  @ApiProperty({ type: UserRefDto, description: 'Quem enviou o anexo.' })
  uploadedBy!: UserRefDto;

  @ApiProperty({ format: 'date-time', description: 'Momento do envio.' })
  uploadedAt!: Date;
}
