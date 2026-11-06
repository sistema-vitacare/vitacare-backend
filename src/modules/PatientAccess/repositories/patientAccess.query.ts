import type { EntityManager } from 'typeorm';

import { PATIENT_SCOPE_WHERE } from '@/modules/Patient/repositories/patientScope.query';
import type {
  PatientLinkRole,
  PatientScope,
  PatientStatus,
} from '@/modules/Patient/types/patient.types';

/**
 * Porta de entrada dos modulos que tocam dados de um paciente (registros,
 * arquivos, downloads, jobs): mesmo alcance de `GET /patients/{id}`. Job
 * reconstroi o escopo a partir do banco antes de chamar; `null` vira 404.
 */
export const findPatientInScope = async (
  manager: EntityManager,
  scope: PatientScope,
  patientId: string,
): Promise<{ id: string; status: PatientStatus } | null> => {
  const [row] = await manager.query<
    Array<{ id: string; status: PatientStatus }>
  >(
    `SELECT p.id, p.status
       FROM patients p
     ${PATIENT_SCOPE_WHERE}
        AND p.id = $4`,
    [
      scope.organizationId,
      scope.viewerUserId,
      scope.viewerLinkRoles,
      patientId,
    ],
  );

  return row ?? null;
};

/**
 * Usuario do vinculo `link` ativo e com perfil que corresponde ao papel (o
 * admin herda o profissional no papel de responsavel); aliases `u` e `ap`. A
 * vigencia (`link.deleted_at IS NULL`) fica com quem usa.
 */
export const AUTHORIZED_LINK_JOIN = `
       JOIN users u
         ON u.id = link.user_id
        AND u.organization_id = link.organization_id
        AND u.status = 'active'
       JOIN access_profiles ap
         ON ap.id = u.profile_id
        AND ap.organization_id = u.organization_id
        AND (link.role = ap.code
             OR (link.role = 'responsible_professional'
                 AND ap.code IN ('professional', 'admin')))`;

/**
 * Vinculos vigentes autorizados de um paciente. Define quem pode ser
 * notificado; preferencias e canais ficam com o modulo de notificacoes, que
 * usa `AUTHORIZED_LINK_JOIN` para aplicar a mesma regra em lote.
 */
export const listPatientRecipients = (
  manager: EntityManager,
  organizationId: string,
  patientId: string,
): Promise<Array<{ userId: string; role: PatientLinkRole }>> =>
  manager.query(
    `SELECT link.user_id AS "userId", link.role
       FROM user_patients link
     ${AUTHORIZED_LINK_JOIN}
      WHERE link.organization_id = $1
        AND link.patient_id = $2
        AND link.deleted_at IS NULL
      ORDER BY link.role, link.user_id`,
    [organizationId, patientId],
  );
