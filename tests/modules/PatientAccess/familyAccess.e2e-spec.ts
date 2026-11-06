import type { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';

import { EvaluateFollowUpAlertsUseCase } from '@/modules/Alert/EvaluateFollowUpAlerts/evaluateFollowUpAlerts.useCase';
import { AttachmentController } from '@/modules/Attachment/attachment.controller';
import { ATTACHMENT_USE_CASES } from '@/modules/Attachment/attachment.module';
import { AttachmentUploadInterceptor } from '@/modules/Attachment/http/attachmentUpload.interceptor';
import { AttachmentRepository } from '@/modules/Attachment/repositories/attachment.repository';
import { FollowUpController } from '@/modules/FollowUp/followUp.controller';
import { FOLLOW_UP_USE_CASES } from '@/modules/FollowUp/followUp.module';
import { FollowUpRepository } from '@/modules/FollowUp/repositories/followUp.repository';
import { FormController } from '@/modules/Form/form.controller';
import { FORM_USE_CASES } from '@/modules/Form/form.module';
import { FormRepository } from '@/modules/Form/repositories/form.repository';
import { HistoryController } from '@/modules/History/history.controller';
import {
  HISTORY_REPOSITORIES,
  HISTORY_USE_CASES,
} from '@/modules/History/history.module';
import { MedicationController } from '@/modules/Medication/medication.controller';
import { MEDICATION_USE_CASES } from '@/modules/Medication/medication.module';
import { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';
import { PatientController } from '@/modules/Patient/patient.controller';
import { PATIENT_USE_CASES } from '@/modules/Patient/patient.module';
import { PatientRepository } from '@/modules/Patient/repositories/patient.repository';
import { FileStorageService } from '@/storage/fileStorage.service';

import {
  bootNotificationApp,
  type NotificationApp,
  type Tenant,
} from '../Notification/notificationApp.fixtures';

/**
 * BE-19 (RF016, UC14) de ponta a ponta, com login, guards e PostgreSQL reais:
 * o familiar vinculado le o recorte do cadastro e so os registros validos,
 * nunca escreve, e qualquer identificador de outro paciente ou organizacao,
 * ou um vinculo revogado, se comporta como inexistente.
 */

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('imagem sintetica'),
]);

const CPF = '52998224725';

/** Mascara fixa dos campos que o familiar nao ve (BE-19). */
const HIDDEN = '********';

interface FormBody {
  id: string;
  currentVersion: { id: string; fields: Array<{ id: string }> };
}

interface PatientBody {
  id: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  address: Record<string, string | null>;
  healthPlan: string | null;
  notes: string | null;
  mainCondition: string | null;
  secondaryConditions: string[];
  responsible: { name: string } | null;
  viewerLink: { role: string; linkType: string | null } | null;
}

interface PageBody<T> {
  data: T[];
  meta: { pagination: { total: number } };
}

describeWithDatabase('visao familiar somente leitura (e2e)', () => {
  let t: NotificationApp;
  let storageRoot: string;

  const server = (): App => t.app.getHttpServer() as App;
  const dataOf = <T>(response: { body: unknown }) =>
    (response.body as { data: T }).data;
  const codeOf = (response: { body: unknown }) =>
    (response.body as { error?: { code: string } }).error?.code;

  const upload = (followUpId: string, token: string) =>
    request(server())
      .post(`/api/v1/follow-ups/${followUpId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG, 'curativo.png');

  const remove = (followUpId: string, attachmentId: string, token: string) =>
    request(server())
      .delete(`/api/v1/follow-ups/${followUpId}/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${token}`);

  const attachmentsPath = (followUpId: string) =>
    `/follow-ups/${followUpId}/attachments`;

  /**
   * Paciente de `tenant` com cadastro completo (CPF so quando pedido, por ser
   * unico na organizacao), familiar vinculado como "Filha", dois registros do
   * cuidador (o segundo anulado) e um anexo em cada um.
   */
  const scenario = async (tenant: Tenant, cpf: string | null = null) => {
    const patientId = await t.linkedPatient(tenant, 'Maria Sintetica');

    await t.dataSource.query(
      `UPDATE patients
          SET cpf = $2, phone = '(11) 98765-4321', email = 'maria@example.test',
              street = 'Rua Exemplo', city = 'Santos', state = 'SP',
              health_plan = 'Plano Exemplo', notes = 'Observacao sintetica',
              main_condition = 'Hipertensao', secondary_conditions = '{DM2}'
        WHERE id = $1`,
      [patientId, cpf],
    );
    await t.dataSource.query(
      `UPDATE user_patients SET link_type = 'Filha'
        WHERE patient_id = $1 AND role = 'family'`,
      [patientId],
    );

    const created = await t.http('post', '/forms', tenant.tokens.professional, {
      name: `Sinais ${patientId}`,
      audience: 'organization',
      fields: [
        {
          name: 'Glicemia',
          fieldType: 'number',
          requirement: 'optional',
          unit: 'mg/dL',
          decimalPlaces: 0,
        },
      ],
    });
    const form = dataOf<FormBody>(
      await t.http(
        'post',
        `/forms/${dataOf<FormBody>(created).id}/publish`,
        tenant.tokens.professional,
        { confirmImpact: false },
      ),
    );
    const submit = async (value: number, visitedAt: string) => {
      const response = await t.http(
        'post',
        '/follow-ups',
        tenant.tokens.caregiver,
        {
          patientId,
          formId: form.id,
          formVersionId: form.currentVersion.id,
          visitedAt,
          answers: [{ fieldId: form.currentVersion.fields[0].id, value }],
        },
      );

      expect(response.status).toBe(201);

      return dataOf<{ id: string }>(response).id;
    };

    const valid = await submit(98, '2026-10-01T12:00:00.000Z');
    const annulled = await submit(980, '2026-10-02T12:00:00.000Z');
    const attach = async (followUpId: string) => {
      const response = await upload(followUpId, tenant.tokens.caregiver);

      expect(response.status).toBe(201);

      return dataOf<{ id: string }>(response).id;
    };
    const validAttachment = await attach(valid);
    const annulledAttachment = await attach(annulled);

    expect(
      (
        await t.http(
          'post',
          `/follow-ups/${annulled}/annul`,
          tenant.tokens.professional,
          { reason: 'Valor digitado errado.' },
        )
      ).status,
    ).toBe(200);

    return {
      patientId,
      valid,
      annulled,
      validAttachment,
      annulledAttachment,
    };
  };

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'vitacare-family-'));

    const storage = new FileStorageService({
      getOrThrow: () => storageRoot,
    } as unknown as ConfigService);

    await storage.onModuleInit();

    t = await bootNotificationApp(databaseUrl!, {
      controllers: [
        PatientController,
        FormController,
        FollowUpController,
        AttachmentController,
        MedicationController,
        HistoryController,
      ],
      providers: [
        ...PATIENT_USE_CASES,
        PatientRepository,
        ...FORM_USE_CASES,
        FormRepository,
        ...FOLLOW_UP_USE_CASES,
        FollowUpRepository,
        {
          provide: EvaluateFollowUpAlertsUseCase,
          useValue: { afterSubmit: jest.fn().mockResolvedValue(undefined) },
        },
        ...ATTACHMENT_USE_CASES,
        AttachmentRepository,
        AttachmentUploadInterceptor,
        { provide: FileStorageService, useValue: storage },
        ...MEDICATION_USE_CASES,
        MedicationRepository,
        ...HISTORY_USE_CASES,
        ...HISTORY_REPOSITORIES,
      ],
    });
  }, 180000);

  afterAll(async () => {
    await t?.close();

    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  }, 60000);

  describe('cadastro do paciente', () => {
    it('familiar le o recorte da Figura 37, com os demais campos mascarados, e o parentesco; quem le tudo nao perde nada', async () => {
      const { A } = t.tenants;
      const { patientId } = await scenario(A, CPF);

      const family = await t.http(
        'get',
        `/patients/${patientId}`,
        A.tokens.family,
      );

      expect(family.status).toBe(200);
      expect(dataOf<PatientBody>(family)).toMatchObject({
        id: patientId,
        cpf: HIDDEN,
        phone: HIDDEN,
        email: HIDDEN,
        healthPlan: HIDDEN,
        notes: HIDDEN,
        mainCondition: 'Hipertensao',
        secondaryConditions: ['DM2'],
        responsible: { name: expect.any(String) as string },
        viewerLink: { role: 'family', linkType: 'Filha' },
      });
      expect(
        Object.values(dataOf<PatientBody>(family).address).every(
          (part) => part === HIDDEN,
        ),
      ).toBe(true);

      const listed = await t.http('get', '/patients', A.tokens.family);
      const [item] = (listed.body as PageBody<PatientBody>).data.filter(
        (patient) => patient.id === patientId,
      );

      expect(item).toMatchObject({
        cpf: HIDDEN,
        phone: HIDDEN,
        address: { city: HIDDEN, complement: HIDDEN },
        viewerLink: { role: 'family', linkType: 'Filha' },
      });

      const professional = dataOf<PatientBody>(
        await t.http('get', `/patients/${patientId}`, A.tokens.professional),
      );

      expect(professional).toMatchObject({
        cpf: CPF,
        phone: '(11) 98765-4321',
        healthPlan: 'Plano Exemplo',
        notes: 'Observacao sintetica',
        address: { city: 'Santos' },
        viewerLink: null,
      });

      const caregiver = dataOf<PatientBody>(
        await t.http('get', `/patients/${patientId}`, A.tokens.caregiver),
      );

      expect(caregiver).toMatchObject({
        cpf: CPF,
        viewerLink: { role: 'caregiver', linkType: null },
      });
    });

    it('a busca do familiar nao procura no CPF', async () => {
      const { A } = t.tenants;
      const { patientId } = await scenario(A, '11144477735');
      const search = (token: string, term: string) =>
        t.http('get', `/patients?search=${term}`, token);
      const ids = (response: { body: unknown }) =>
        (response.body as PageBody<PatientBody>).data.map((p) => p.id);

      expect(ids(await search(A.tokens.caregiver, '444.777'))).toContain(
        patientId,
      );
      expect(ids(await search(A.tokens.family, '444.777'))).not.toContain(
        patientId,
      );
      expect(ids(await search(A.tokens.family, 'Maria'))).toContain(patientId);
    });
  });

  describe('registros de acompanhamento e anexos', () => {
    it('familiar ve so registros validos e os anexos deles; anulado se comporta como inexistente', async () => {
      const { A } = t.tenants;
      const s = await scenario(A);
      const token = A.tokens.family;

      const history = await t.http(
        'get',
        `/follow-ups?patientId=${s.patientId}`,
        token,
      );
      const page = history.body as PageBody<{ id: string }>;

      expect(page.data.map((record) => record.id)).toEqual([s.valid]);
      expect(page.meta.pagination.total).toBe(1);

      const annulledOnly = await t.http(
        'get',
        `/follow-ups?patientId=${s.patientId}&status=annulled`,
        token,
      );

      expect(annulledOnly.status).toBe(200);
      expect((annulledOnly.body as PageBody<unknown>).data).toEqual([]);
      expect(
        (annulledOnly.body as PageBody<unknown>).meta.pagination.total,
      ).toBe(0);

      const detail = await t.http('get', `/follow-ups/${s.annulled}`, token);

      expect(detail.status).toBe(404);
      expect(codeOf(detail)).toBe('FOLLOW_UP_NOT_FOUND');
      expect(
        (await t.http('get', `/follow-ups/${s.valid}`, token)).status,
      ).toBe(200);

      const attachments = await t.http('get', attachmentsPath(s.valid), token);

      expect(attachments.status).toBe(200);
      expect(dataOf<Array<{ id: string }>>(attachments)).toEqual([
        expect.objectContaining({ id: s.validAttachment }),
      ]);
      expect(
        (
          await t.http(
            'get',
            `${attachmentsPath(s.valid)}/${s.validAttachment}/content`,
            token,
          )
        ).status,
      ).toBe(200);

      const hiddenList = await t.http(
        'get',
        attachmentsPath(s.annulled),
        token,
      );

      expect(hiddenList.status).toBe(404);
      expect(codeOf(hiddenList)).toBe('FOLLOW_UP_NOT_FOUND');

      const hiddenContent = await t.http(
        'get',
        `${attachmentsPath(s.annulled)}/${s.annulledAttachment}/content`,
        token,
      );

      expect(hiddenContent.status).toBe(404);
      expect(codeOf(hiddenContent)).toBe('ATTACHMENT_NOT_FOUND');
    });

    it('cuidador e profissional continuam vendo o anulado e seus anexos', async () => {
      const { A } = t.tenants;
      const s = await scenario(A);

      for (const token of [A.tokens.caregiver, A.tokens.professional]) {
        const history = await t.http(
          'get',
          `/follow-ups?patientId=${s.patientId}`,
          token,
        );

        expect(
          (history.body as PageBody<{ id: string }>).data.map((r) => r.id),
        ).toEqual([s.annulled, s.valid]);
        expect(
          (await t.http('get', `/follow-ups/${s.annulled}`, token)).status,
        ).toBe(200);
        expect(
          (await t.http('get', attachmentsPath(s.annulled), token)).status,
        ).toBe(200);
      }
    });
  });

  describe('somente leitura', () => {
    it('toda escrita do familiar e 403 e nada muda', async () => {
      const { A } = t.tenants;
      const s = await scenario(A);
      const token = A.tokens.family;
      const snapshot = () =>
        t.dataSource.query<unknown[]>(
          `SELECT
             (SELECT count(*) FROM patients WHERE organization_id = $1) AS patients,
             (SELECT count(*) FROM follow_up_records WHERE organization_id = $1) AS records,
             (SELECT count(*) FROM follow_up_attachments WHERE organization_id = $1 AND deleted_at IS NULL) AS attachments,
             (SELECT count(*) FROM medications WHERE organization_id = $1) AS medications,
             (SELECT updated_at FROM patients WHERE id = $2) AS touched`,
          [A.id, s.patientId],
        );
      const before = await snapshot();

      const attempts = [
        t.http('post', '/patients', token, {
          name: 'Novo',
          birthDate: '1950-01-01',
          responsibleUserId: A.users.professional,
        }),
        t.http('patch', `/patients/${s.patientId}`, token, { notes: 'x' }),
        t.http('post', `/patients/${s.patientId}/deactivate`, token),
        t.http('post', '/follow-ups', token, {
          patientId: s.patientId,
          formId: s.patientId,
          formVersionId: s.patientId,
          answers: [],
        }),
        t.http('post', `/follow-ups/${s.valid}/annul`, token, {
          reason: 'Tentativa do familiar.',
        }),
        upload(s.valid, token),
        remove(s.valid, s.validAttachment, token),
        t.http('post', '/medications', token, {
          patientId: s.patientId,
          name: 'Medicamento',
        }),
      ];

      for (const response of await Promise.all(attempts)) {
        expect(response.status).toBe(403);
        expect(codeOf(response)).toBe('AUTH_FORBIDDEN');
      }

      const alert = await t.notifiedAlert(A, s.patientId);
      const resolve = await t.http('post', `/alerts/${alert}/resolve`, token);

      expect(resolve.status).toBe(403);
      expect(
        await t.scalar('SELECT status AS value FROM alerts WHERE id = $1', [
          alert,
        ]),
      ).toBe('open');
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('alcance', () => {
    it('identificador de outro paciente ou de outra organizacao e 404 sem conteudo', async () => {
      const { A, B } = t.tenants;
      const own = await scenario(A);
      const unlinked = await scenario(A);
      const other = await scenario(B);
      const token = A.tokens.family;

      await t.dataSource.query(
        `UPDATE user_patients SET deleted_at = now()
          WHERE patient_id = $1 AND user_id = $2`,
        [unlinked.patientId, A.users.family],
      );

      for (const target of [unlinked, other]) {
        const reads = [
          [`/patients/${target.patientId}`, 'PATIENT_NOT_FOUND'],
          [`/patients/${target.patientId}/overview`, 'PATIENT_NOT_FOUND'],
          [`/follow-ups?patientId=${target.patientId}`, 'PATIENT_NOT_FOUND'],
          [`/medications?patientId=${target.patientId}`, 'PATIENT_NOT_FOUND'],
          [`/alerts?patientId=${target.patientId}`, 'PATIENT_NOT_FOUND'],
          [`/follow-ups/${target.valid}`, 'FOLLOW_UP_NOT_FOUND'],
          [attachmentsPath(target.valid), 'FOLLOW_UP_NOT_FOUND'],
          [
            `${attachmentsPath(target.valid)}/${target.validAttachment}/content`,
            'ATTACHMENT_NOT_FOUND',
          ],
          // Anexo do paciente proprio sob o registro alheio, e vice-versa.
          [
            `${attachmentsPath(target.valid)}/${own.validAttachment}/content`,
            'ATTACHMENT_NOT_FOUND',
          ],
          [
            `${attachmentsPath(own.valid)}/${target.validAttachment}/content`,
            'ATTACHMENT_NOT_FOUND',
          ],
        ] as const;

        for (const [path, code] of reads) {
          const response = await t.http('get', path, token);

          expect({ path, status: response.status }).toEqual({
            path,
            status: 404,
          });
          expect(codeOf(response)).toBe(code);
          expect((response.body as { data?: unknown }).data).toBeUndefined();
        }
      }

      expect(
        (await t.http('get', `/patients/${own.patientId}`, token)).status,
      ).toBe(200);
    });

    it('vinculo revogado perde o acesso na requisicao seguinte; sem vinculo a lista e vazia', async () => {
      const { A } = t.tenants;
      const s = await scenario(A);
      const token = A.tokens.family;
      const paths = [
        `/patients/${s.patientId}`,
        `/patients/${s.patientId}/overview`,
        `/follow-ups?patientId=${s.patientId}`,
        `/follow-ups/${s.valid}`,
        `${attachmentsPath(s.valid)}/${s.validAttachment}/content`,
        `/medications?patientId=${s.patientId}`,
        `/alerts?patientId=${s.patientId}`,
      ];

      for (const path of paths) {
        expect((await t.http('get', path, token)).status).toBe(200);
      }

      await t.dataSource.query(
        `UPDATE user_patients SET deleted_at = now()
          WHERE organization_id = $1 AND user_id = $2`,
        [A.id, A.users.family],
      );

      for (const path of paths) {
        expect({
          path,
          status: (await t.http('get', path, token)).status,
        }).toEqual({ path, status: 404 });
      }

      const listed = await t.http('get', '/patients', token);

      expect(listed.status).toBe(200);
      expect((listed.body as PageBody<unknown>).data).toEqual([]);
      expect((listed.body as PageBody<unknown>).meta.pagination.total).toBe(0);
    });
  });
});
