import { HttpStatus } from '@nestjs/common';

export const AttachmentErrors = {
  FILE_REQUIRED: {
    code: 'ATTACHMENT_FILE_REQUIRED',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Envie um arquivo no campo `file`.',
  },
  EMPTY: {
    code: 'ATTACHMENT_EMPTY',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'O arquivo enviado está vazio.',
  },
  TOO_LARGE: {
    code: 'ATTACHMENT_TOO_LARGE',
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    message: 'O arquivo passa do limite de 10 MB.',
  },
  UNSUPPORTED_TYPE: {
    code: 'ATTACHMENT_UNSUPPORTED_TYPE',
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    message: 'Envie uma imagem JPEG, PNG ou WEBP, ou um PDF.',
  },
  NOT_AUTHOR: {
    code: 'ATTACHMENT_NOT_AUTHOR',
    status: HttpStatus.FORBIDDEN,
    message: 'Só quem fez o registro pode anexar ou remover arquivos dele.',
  },
  FOLLOW_UP_ANNULLED: {
    code: 'ATTACHMENT_FOLLOW_UP_ANNULLED',
    status: HttpStatus.CONFLICT,
    message: 'O registro foi anulado e não recebe anexos.',
  },
  PATIENT_INACTIVE: {
    code: 'ATTACHMENT_PATIENT_INACTIVE',
    status: HttpStatus.CONFLICT,
    message: 'O paciente está inativo e não recebe novos anexos.',
  },
  LIMIT_REACHED: {
    code: 'ATTACHMENT_LIMIT_REACHED',
    status: HttpStatus.CONFLICT,
    message: 'Este registro já tem 5 anexos.',
  },
  NOT_FOUND: {
    code: 'ATTACHMENT_NOT_FOUND',
    status: HttpStatus.NOT_FOUND,
    message: 'Anexo não encontrado.',
  },
  CONTENT_MISSING: {
    code: 'ATTACHMENT_CONTENT_MISSING',
    status: HttpStatus.NOT_FOUND,
    message: 'O arquivo deste anexo não está disponível.',
  },
} as const;
