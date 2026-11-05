import { Readable } from 'node:stream';

import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { DownloadAttachmentUseCase } from '@/modules/Attachment/DownloadAttachment/downloadAttachment.useCase';
import { ListAttachmentsUseCase } from '@/modules/Attachment/ListAttachments/listAttachments.useCase';
import { RemoveAttachmentUseCase } from '@/modules/Attachment/RemoveAttachment/removeAttachment.useCase';
import type { AttachmentRepository } from '@/modules/Attachment/repositories/attachment.repository';
import { UploadAttachmentUseCase } from '@/modules/Attachment/UploadAttachment/uploadAttachment.useCase';
import type { FileStorageService } from '@/storage/fileStorage.service';

import { ACTOR_ID, sessionOf } from '../Patient/patient.fixtures';
import {
  ATTACHMENT_ID,
  FOLLOW_UP_ID,
  ORGANIZATION_ID,
  attachmentRow,
  tempFile,
} from './attachment.fixtures';

const repository = {
  upload: jest.fn(),
  list: jest.fn(),
  findForDownload: jest.fn(),
  remove: jest.fn(),
};
const storage = {
  promote: jest.fn(),
  remove: jest.fn(),
  open: jest.fn(),
};
const attachments = repository as unknown as AttachmentRepository;
const files = storage as unknown as FileStorageService;

const caregiver = sessionOf(ProfileCode.CAREGIVER);
const professional = sessionOf(ProfileCode.PROFESSIONAL);

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DomainException);

    return (error as DomainException).code;
  }

  throw new Error('Era esperada uma DomainException.');
};

/** Repositorio que aprova as checagens e grava o arquivo, como o real. */
const uploadStoring = (outcome: () => Promise<unknown>) =>
  repository.upload.mockImplementation(
    async (_command: unknown, store: () => Promise<void>) => {
      await store();
      return outcome();
    },
  );

beforeEach(() => jest.resetAllMocks());

describe('UploadAttachmentUseCase', () => {
  const useCase = new UploadAttachmentUseCase(attachments, files);

  it('grava sob chave do servidor com organizacao, autor e tipo detectado', async () => {
    uploadStoring(() =>
      Promise.resolve({ kind: 'created', attachment: attachmentRow() }),
    );

    const result = await useCase.execute(
      FOLLOW_UP_ID,
      tempFile({ originalName: '../segredo.jpg' }),
      caregiver,
    );

    const [command] = repository.upload.mock.calls[0] as [
      Record<string, unknown>,
    ];

    expect(command).toMatchObject({
      organizationId: ORGANIZATION_ID,
      actorUserId: ACTOR_ID,
      followUpId: FOLLOW_UP_ID,
      fileName: 'segredo.jpg',
      contentType: 'image/png',
      sizeBytes: 2048,
      storageKey: `attachments/${ORGANIZATION_ID}/${String(command.attachmentId)}`,
    });
    expect(storage.promote).toHaveBeenCalledWith(
      '/storage/tmp/upload-1',
      command.storageKey,
    );
    expect(result).toEqual(
      expect.objectContaining({ id: ATTACHMENT_ID, fileName: 'ferida.png' }),
    );
    expect(result).not.toHaveProperty('storageKey');
  });

  it('sem arquivo responde ATTACHMENT_FILE_REQUIRED', async () => {
    await expect(
      codeOf(useCase.execute(FOLLOW_UP_ID, undefined, caregiver)),
    ).resolves.toBe('ATTACHMENT_FILE_REQUIRED');
  });

  it('arquivo vazio responde ATTACHMENT_EMPTY sem tocar o banco', async () => {
    await expect(
      codeOf(
        useCase.execute(
          FOLLOW_UP_ID,
          tempFile({ size: 0, head: Buffer.alloc(0) }),
          caregiver,
        ),
      ),
    ).resolves.toBe('ATTACHMENT_EMPTY');
    expect(repository.upload).not.toHaveBeenCalled();
  });

  it('texto disfarcado de imagem responde ATTACHMENT_UNSUPPORTED_TYPE', async () => {
    await expect(
      codeOf(
        useCase.execute(
          FOLLOW_UP_ID,
          tempFile({ head: Buffer.from('hello world.jpg') }),
          caregiver,
        ),
      ),
    ).resolves.toBe('ATTACHMENT_UNSUPPORTED_TYPE');
    expect(repository.upload).not.toHaveBeenCalled();
  });

  it.each([
    ['follow_up_not_found', 'FOLLOW_UP_NOT_FOUND'],
    ['not_author', 'ATTACHMENT_NOT_AUTHOR'],
    ['follow_up_annulled', 'ATTACHMENT_FOLLOW_UP_ANNULLED'],
    ['patient_inactive', 'ATTACHMENT_PATIENT_INACTIVE'],
    ['limit_reached', 'ATTACHMENT_LIMIT_REACHED'],
  ])('checagem %s responde %s sem gravar arquivo', async (kind, code) => {
    repository.upload.mockResolvedValue({ kind });

    await expect(
      codeOf(useCase.execute(FOLLOW_UP_ID, tempFile(), caregiver)),
    ).resolves.toBe(code);
    expect(storage.promote).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('falha depois de gravar apaga o arquivo e relanca o erro original', async () => {
    const failure = new Error('commit falhou');

    uploadStoring(() => Promise.reject(failure));

    await expect(
      useCase.execute(FOLLOW_UP_ID, tempFile(), caregiver),
    ).rejects.toBe(failure);

    const key = (storage.promote.mock.calls[0] as [string, string])[1];

    expect(storage.remove).toHaveBeenCalledWith(key);
  });

  it('compensacao que falha nao esconde o erro original', async () => {
    const failure = new Error('insert falhou');

    uploadStoring(() => Promise.reject(failure));
    storage.remove.mockRejectedValue(new Error('disco'));

    await expect(
      useCase.execute(FOLLOW_UP_ID, tempFile(), caregiver),
    ).rejects.toBe(failure);
  });

  it('falha antes de gravar nao tenta apagar arquivo', async () => {
    repository.upload.mockRejectedValue(new Error('banco fora'));

    await expect(
      useCase.execute(FOLLOW_UP_ID, tempFile(), caregiver),
    ).rejects.toThrow('banco fora');
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe('ListAttachmentsUseCase', () => {
  const useCase = new ListAttachmentsUseCase(attachments);

  it('registro fora do alcance responde FOLLOW_UP_NOT_FOUND', async () => {
    repository.list.mockResolvedValue(null);

    await expect(
      codeOf(useCase.execute(FOLLOW_UP_ID, caregiver)),
    ).resolves.toBe('FOLLOW_UP_NOT_FOUND');
  });

  it('lista com o escopo de pacientes da sessao', async () => {
    repository.list.mockResolvedValue([attachmentRow()]);

    const result = await useCase.execute(FOLLOW_UP_ID, caregiver);

    expect(result).toHaveLength(1);
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        viewerUserId: ACTOR_ID,
      }),
      FOLLOW_UP_ID,
    );
  });
});

describe('DownloadAttachmentUseCase', () => {
  const useCase = new DownloadAttachmentUseCase(attachments, files);

  it('anexo fora do alcance responde ATTACHMENT_NOT_FOUND', async () => {
    repository.findForDownload.mockResolvedValue(null);

    await expect(
      codeOf(useCase.execute(FOLLOW_UP_ID, ATTACHMENT_ID, caregiver)),
    ).resolves.toBe('ATTACHMENT_NOT_FOUND');
    expect(storage.open).not.toHaveBeenCalled();
  });

  it('arquivo ausente no volume responde ATTACHMENT_CONTENT_MISSING', async () => {
    repository.findForDownload.mockResolvedValue({
      ...attachmentRow(),
      storageKey: 'attachments/org/a',
    });
    storage.open.mockResolvedValue(null);

    await expect(
      codeOf(useCase.execute(FOLLOW_UP_ID, ATTACHMENT_ID, caregiver)),
    ).resolves.toBe('ATTACHMENT_CONTENT_MISSING');
  });

  it('devolve o arquivo com tipo, tamanho e nome para baixar', async () => {
    repository.findForDownload.mockResolvedValue({
      ...attachmentRow(),
      storageKey: 'attachments/org/a',
    });
    storage.open.mockResolvedValue({
      stream: Readable.from([Buffer.from('png')]),
      size: 2048,
    });

    const file = await useCase.execute(FOLLOW_UP_ID, ATTACHMENT_ID, caregiver);

    expect(storage.open).toHaveBeenCalledWith('attachments/org/a');
    expect(file.getHeaders()).toEqual({
      type: 'image/png',
      length: 2048,
      disposition: `attachment; filename="ferida.png"; filename*=UTF-8''ferida.png`,
    });
  });
});

describe('RemoveAttachmentUseCase', () => {
  const useCase = new RemoveAttachmentUseCase(attachments, files);

  it('apaga o arquivo depois de remover a linha', async () => {
    repository.remove.mockResolvedValue({
      kind: 'removed',
      storageKey: 'attachments/org/a',
    });

    await useCase.execute(FOLLOW_UP_ID, ATTACHMENT_ID, caregiver);

    expect(repository.remove).toHaveBeenCalledWith(
      expect.objectContaining({ removeAny: false, actorUserId: ACTOR_ID }),
    );
    expect(storage.remove).toHaveBeenCalledWith('attachments/org/a');
  });

  it('com follow_ups:annul remove qualquer anexo da organizacao', async () => {
    repository.remove.mockResolvedValue({
      kind: 'removed',
      storageKey: 'attachments/org/a',
    });

    await useCase.execute(FOLLOW_UP_ID, ATTACHMENT_ID, professional);

    expect(repository.remove).toHaveBeenCalledWith(
      expect.objectContaining({ removeAny: true }),
    );
  });

  it('falha ao apagar o arquivo nao desfaz a remocao', async () => {
    repository.remove.mockResolvedValue({
      kind: 'removed',
      storageKey: 'attachments/org/a',
    });
    storage.remove.mockRejectedValue(new Error('disco'));

    await expect(
      useCase.execute(FOLLOW_UP_ID, ATTACHMENT_ID, caregiver),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['not_found', 'ATTACHMENT_NOT_FOUND'],
    ['not_author', 'ATTACHMENT_NOT_AUTHOR'],
  ])('%s responde %s sem apagar arquivo', async (kind, code) => {
    repository.remove.mockResolvedValue({ kind });

    await expect(
      codeOf(useCase.execute(FOLLOW_UP_ID, ATTACHMENT_ID, caregiver)),
    ).resolves.toBe(code);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
