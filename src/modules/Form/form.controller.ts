import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
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

import { CreateFormDto } from './CreateForm/createForm.dto';
import { CreateFormUseCase } from './CreateForm/createForm.useCase';
import { FormDto, FormSummaryDto } from './dtos/form.dto';
import { GetFormUseCase } from './GetForm/getForm.useCase';
import { ListFormsQueryDto } from './ListForms/listForms.dto';
import { ListFormsUseCase } from './ListForms/listForms.useCase';
import { UpdateFormDto } from './UpdateForm/updateForm.dto';
import { UpdateFormUseCase } from './UpdateForm/updateForm.useCase';

const UNAUTHENTICATED = { status: 401, codes: ['AUTH_UNAUTHENTICATED'] };
const FORBIDDEN = { status: 403, codes: ['AUTH_FORBIDDEN'] };
const NOT_FOUND = { status: 404, codes: ['FORM_NOT_FOUND'] };
const VALIDATION = { status: 422, codes: ['VALIDATION_FAILED'] };

@ApiTags('forms')
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('forms')
export class FormController {
  constructor(
    private readonly createForm: CreateFormUseCase,
    private readonly listForms: ListFormsUseCase,
    private readonly getForm: GetFormUseCase,
    private readonly updateForm: UpdateFormUseCase,
  ) {}

  @Post()
  @RequirePermissions(Permissions.FORMS_CREATE)
  @ApiOperation({
    summary:
      'Cria um formulario de acompanhamento em rascunho, com campos, publico e frequencia esperada.',
  })
  @ApiEnvelope(FormDto, { status: HttpStatus.CREATED })
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, {
    status: 422,
    codes: [
      'VALIDATION_FAILED',
      'FORM_EMPTY',
      'FORM_INVALID_FIELDS',
      'FORM_INVALID_PATIENTS',
    ],
  })
  async create(
    @Body() body: CreateFormDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<FormDto> {
    return this.createForm.execute(body, ctx);
  }

  @Get()
  @RequirePermissions(Permissions.FORMS_READ)
  @ApiOperation({
    summary:
      'Lista os formularios ao alcance da sessao, paginados; com patientId, so os ativos que valem para o paciente.',
  })
  @ApiEnvelope(FormSummaryDto, { isArray: true })
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    { status: 404, codes: ['PATIENT_NOT_FOUND'] },
    VALIDATION,
  )
  async list(
    @Query() query: ListFormsQueryDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<EnvelopePayload<FormSummaryDto[]>> {
    return this.listForms.execute(query, ctx);
  }

  @Get(':formId')
  @RequirePermissions(Permissions.FORMS_READ)
  @ApiOperation({
    summary:
      'Consulta um formulario com a versao vigente e, para quem configura, o rascunho.',
  })
  @ApiEnvelope(FormDto)
  @ApiErrors(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION)
  async get(
    @Param('formId', UuidParam('formId')) formId: string,
    @CurrentContext() ctx: RequestContext,
  ): Promise<FormDto> {
    return this.getForm.execute(formId, ctx);
  }

  @Patch(':formId')
  @RequirePermissions(Permissions.FORMS_UPDATE)
  @ApiOperation({
    summary:
      'Edita nome, descricao, tipo, frequencia e publico do formulario, sem gerar nova versao.',
  })
  @ApiEnvelope(FormDto)
  @ApiErrors(
    UNAUTHENTICATED,
    FORBIDDEN,
    NOT_FOUND,
    { status: 409, codes: ['FORM_INACTIVE'] },
    {
      status: 422,
      codes: [
        'VALIDATION_FAILED',
        'FORM_INVALID_PATIENTS',
        'FORM_NOTHING_TO_UPDATE',
      ],
    },
  )
  async update(
    @Param('formId', UuidParam('formId')) formId: string,
    @Body() body: UpdateFormDto,
    @CurrentContext() ctx: RequestContext,
  ): Promise<FormDto> {
    return this.updateForm.execute(formId, body, ctx);
  }
}
