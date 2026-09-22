---
title: Redefinir senha temporária de usuário
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/auth/users/:userId/temporary-password
source: src/modules/Auth/auth.controller.ts
---
# POST /api/v1/auth/users/:userId/temporary-password
Exige Bearer normal e permissão `users:reset_password`. Path `userId` é UUID; sem corpo/query. Retorna `201` envelopado com `temporaryPassword` e `Cache-Control: no-store`; a senha é exibida uma única vez, persistida apenas como hash, exige troca e revoga sessões do alvo. Alvo inexistente ou de outro tenant retorna `404 AUTH_USER_NOT_FOUND`; própria conta retorna `409 AUTH_INVALID_STATE`.
