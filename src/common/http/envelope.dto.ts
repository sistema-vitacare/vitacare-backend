import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 2 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 143 }) total!: number;
  @ApiProperty({ example: 8 }) totalPages!: number;
}

export class ResponseMetaDto {
  @ApiProperty({ example: '01J8X' }) requestId!: string;
  @ApiProperty({ example: '2026-09-17T12:00:00.000Z' }) timestamp!: string;

  @ApiPropertyOptional({ example: 'Paciente cadastrado com sucesso.' })
  message?: string;

  @ApiPropertyOptional({ type: PaginationMetaDto })
  pagination?: PaginationMetaDto;
}

export class FieldErrorDto {
  @ApiProperty({ example: 'email' }) field!: string;
  @ApiProperty({ example: 'IS_EMAIL' }) code!: string;

  @ApiPropertyOptional({ example: 'Informe um e-mail valido.' })
  message?: string;
}

export class ErrorBodyDto {
  @ApiProperty({ example: 'PATIENT_DUPLICATE_DOCUMENT' }) code!: string;

  @ApiProperty({
    description: 'Mensagem amigavel, exibivel ao usuario final.',
    example: 'Ja existe um paciente com este documento.',
  })
  message!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Frase tecnica escrita pela aplicacao. Nulo em erro inesperado (500).',
    example: 'Documento duplicado na organizacao atual.',
  })
  detail!: string | null;

  @ApiProperty({ type: [FieldErrorDto], nullable: true })
  fields!: FieldErrorDto[] | null;
}

export class ErrorMetaDto {
  @ApiProperty({ example: '01J8Y' }) requestId!: string;
  @ApiProperty({ example: '2026-09-17T12:00:01.000Z' }) timestamp!: string;
  @ApiProperty({ example: '/api/v1/patients' }) path!: string;
  @ApiProperty({ example: 'POST' }) method!: string;
  @ApiProperty({ example: 409 }) status!: number;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto }) error!: ErrorBodyDto;
  @ApiProperty({ type: ErrorMetaDto }) meta!: ErrorMetaDto;
}
