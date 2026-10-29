import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'clinica-exemplo',
    description: 'Codigo publico usado no login. Imutavel.',
  })
  code!: string;

  @ApiPropertyOptional({
    enum: ['tenant', 'platform'],
    description: 'Presente apenas para a administracao da plataforma.',
  })
  kind?: 'tenant' | 'platform';

  @ApiProperty({ example: 'Clinica Exemplo' })
  tradeName!: string;

  @ApiProperty({ nullable: true, example: 'Clinica Exemplo LTDA' })
  legalName!: string | null;

  @ApiProperty({ nullable: true, example: '00.000.000/0001-00' })
  document!: string | null;

  @ApiProperty({ nullable: true, example: '(11) 3000-0000' })
  phone!: string | null;

  @ApiProperty({ nullable: true, example: 'contato@example.test' })
  email!: string | null;

  @ApiProperty({ enum: ['active', 'inactive'] })
  status!: 'active' | 'inactive';

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Plano de uso; `null` somente na organizacao de plataforma.',
  })
  usagePlanId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: 'Momento da inativacao; `null` enquanto ativa.',
  })
  deletedAt!: string | null;
}
