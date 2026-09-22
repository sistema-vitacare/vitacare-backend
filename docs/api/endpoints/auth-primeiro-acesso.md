---
title: Primeiro acesso
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/auth/password/first-access
source: src/modules/Auth/auth.controller.ts
---
# POST /api/v1/auth/password/first-access
Exige Bearer de sessão `password_change`; corpo JSON `newPassword` (texto, 8–128 caracteres). Sem path/query. Retorna `200` envelopado com `data:null`; atualiza hash, remove a troca obrigatória, revoga o desafio e exige login novo. Token ausente, expirado, revogado ou normal retorna `401 AUTH_UNAUTHENTICATED`; validação retorna `422`.
