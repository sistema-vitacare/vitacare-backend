import type { RequestContext } from '@/common/context/requestContext.type';

import type { AttachmentDto } from '../dtos/attachment.dto';
import type { AttachmentRow } from '../types/attachment.types';

/**
 * Anexo -> resposta, igual para todos os perfis; o familiar so alcanca os de
 * registros validos (BE-19).
 */
export const toAttachmentResponse = (
  row: AttachmentRow,
  _ctx: RequestContext,
): AttachmentDto => ({
  id: row.id,
  followUpId: row.followUpId,
  fileName: row.fileName,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  uploadedBy: { id: row.uploadedBy.id, name: row.uploadedBy.name },
  uploadedAt: row.uploadedAt,
});
