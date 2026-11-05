import type {
  AttachmentRow,
  UploadedTempFile,
} from '@/modules/Attachment/types/attachment.types';

import { ORGANIZATION_ID } from '../Patient/patient.fixtures';
import { FOLLOW_UP_ID } from '../FollowUp/followUp.fixtures';

export { FOLLOW_UP_ID, ORGANIZATION_ID };

export const ATTACHMENT_ID = '7777777a-0000-4000-8000-00000000000a';

export const PNG_HEAD = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);

export const attachmentRow = (
  overrides: Partial<AttachmentRow> = {},
): AttachmentRow => ({
  id: ATTACHMENT_ID,
  followUpId: FOLLOW_UP_ID,
  fileName: 'ferida.png',
  contentType: 'image/png',
  sizeBytes: 2048,
  uploadedBy: {
    id: '11111111-0000-4000-8000-000000000001',
    name: 'Ana Cuidadora',
  },
  uploadedAt: new Date('2026-11-05T13:00:00.000Z'),
  ...overrides,
});

export const tempFile = (
  overrides: Partial<UploadedTempFile> = {},
): UploadedTempFile => ({
  path: '/storage/tmp/upload-1',
  originalName: 'ferida.png',
  size: 2048,
  head: PNG_HEAD,
  ...overrides,
});
