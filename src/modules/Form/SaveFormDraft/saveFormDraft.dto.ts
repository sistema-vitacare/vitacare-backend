import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';

import { MAX_FORM_FIELDS } from '../CreateForm/createForm.dto';
import { FormFieldInputDto } from '../dtos/formFieldInput.dto';

/** "Salvar rascunho" (Figura 39): substitui a lista inteira de campos. */
export class SaveFormDraftDto {
  @ApiProperty({
    type: [FormFieldInputDto],
    maxItems: MAX_FORM_FIELDS,
    description:
      'Campos da proxima versao na ordem de exibicao. Repita o `fieldKey` dos campos que continuam. Lista vazia e FORM_EMPTY.',
  })
  @IsArray({ message: 'Os campos devem ser uma lista.' })
  @ArrayMaxSize(MAX_FORM_FIELDS, {
    message: `O formulario aceita ate ${MAX_FORM_FIELDS} campos.`,
  })
  @ValidateNested({ each: true })
  @Type(() => FormFieldInputDto)
  fields!: FormFieldInputDto[];
}
