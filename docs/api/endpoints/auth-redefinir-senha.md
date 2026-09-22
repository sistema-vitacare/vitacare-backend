---
title: Redefinir senha
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/auth/password-recovery/reset
source: src/modules/Auth/auth.controller.ts
---
# POST /api/v1/auth/password-recovery/reset
Pública. Corpo: `token` (texto, 1–512) e `newPassword` (texto, 8–128); sem path/query. Retorna `201` envelopado com `data:null`. Token aleatório, expirado, consumido ou revogado retorna `422 AUTH_RESET_TOKEN_INVALID_OR_EXPIRED`; em sucesso consome token e revoga as sessões da conta.
