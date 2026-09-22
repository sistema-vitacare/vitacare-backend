---
title: Alterar senha
status: atual
updated: 2026-09-22
method: PUT
path: /api/v1/auth/password
source: src/modules/Auth/auth.controller.ts
---
# PUT /api/v1/auth/password
Exige sessão Bearer normal. Corpo: `currentPassword` e `newPassword`, ambos texto de 8–128 caracteres. Retorna `200` envelopado com `data:null`, altera o hash e revoga todas as sessões do usuário. Retorna `422 AUTH_CURRENT_PASSWORD_INVALID` ou `AUTH_PASSWORD_REUSE`; autenticação inválida retorna `401`.
