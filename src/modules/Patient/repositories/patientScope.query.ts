/**
 * Alcance de pacientes do tenant `$1` (alias `p`); com `$2`, so os vinculados
 * a esse usuario num papel de `$3` com vinculo vigente. Unica definicao do
 * escopo: pacientes, vinculos e os modulos clinicos futuros a reutilizam.
 */
export const PATIENT_SCOPE_WHERE = `
   WHERE p.organization_id = $1
     AND ($2::uuid IS NULL OR EXISTS (
           SELECT 1
             FROM user_patients viewer
            WHERE viewer.organization_id = p.organization_id
              AND viewer.patient_id = p.id
              AND viewer.user_id = $2
              AND viewer.role = ANY($3::varchar[])
              AND viewer.deleted_at IS NULL))`;
