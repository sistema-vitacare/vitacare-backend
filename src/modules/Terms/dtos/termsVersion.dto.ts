import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class TermsVersionDto {
  @ApiProperty({
    example: 1,
    minimum: 1,
    description: 'Numero da versao; a vigente e a maior publicada.',
  })
  version!: number;

  @ApiProperty({ example: 'Termo de Uso e Privacidade do VitaCare' })
  title!: string;

  @ApiProperty({
    example: '# Termo de Uso e Privacidade do VitaCare\n\nVersão 1\n\n...',
    description:
      'Texto integral em Markdown (UTF-8, quebras LF), so com `#`, `##`, paragrafos, listas `-` e `1.` e negrito `**`. E exatamente o texto aceito.',
  })
  content!: string;

  @ApiProperty({
    example: 'd11270af9e3bfc0817118586325d9cc26444dd4e4a1cb7937cdbc754f807c641',
    pattern: '^[0-9a-f]{64}$',
    description: 'SHA-256 em hex de `content`; identifica o texto aceito.',
  })
  contentHash!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Quando a versao foi publicada.',
  })
  publishedAt!: string;

  @ApiProperty({
    example: '/termos?versao=1',
    description:
      'Caminho da pagina HTML publica desta versao, relativo a origem da API.',
  })
  pageUrl!: string;
}

export class TermsVersionParamDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999999)
  version!: number;
}
