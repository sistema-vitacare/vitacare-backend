import { maskPersonName } from '@/modules/Audit/policies/auditPersonalData.policy';

import type {
  OwnTermsAcceptanceDto,
  TermsAcceptanceDto,
  TermsAcceptanceItemDto,
} from '../dtos/termsAcceptance.dto';
import type {
  TermsAcceptanceListRow,
  TermsAcceptanceRow,
} from '../types/terms.types';

export const toOwnTermsAcceptanceResponse = (
  row: TermsAcceptanceRow,
): OwnTermsAcceptanceDto => ({
  version: row.version,
  contentHash: row.contentHash,
  acceptedAt: row.acceptedAt.toISOString(),
});

export const toTermsAcceptanceResponse = (
  row: TermsAcceptanceRow,
  alreadyAccepted: boolean,
): TermsAcceptanceDto => ({
  id: row.id,
  ...toOwnTermsAcceptanceResponse(row),
  alreadyAccepted,
});

/**
 * Item da consulta. O master ve todas as organizacoes, mas o nome do usuario
 * de outra organizacao sai mascarado, como na auditoria (BE-23).
 */
export const toTermsAcceptanceItemResponse = (
  row: TermsAcceptanceListRow,
  viewerOrganizationId: string,
): TermsAcceptanceItemDto => ({
  id: row.id,
  ...toOwnTermsAcceptanceResponse(row),
  organization: { id: row.organizationId, name: row.organizationName },
  user: {
    id: row.userId,
    name:
      row.organizationId === viewerOrganizationId
        ? row.userName
        : maskPersonName(row.userName),
  },
  profileCode: row.profileCode,
  ipAddress: row.ipAddress,
  userAgent: row.userAgent,
  requestId: row.requestId,
});
