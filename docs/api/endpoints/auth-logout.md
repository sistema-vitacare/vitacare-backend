---
title: Logout
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/auth/logout
source: src/modules/Auth/auth.controller.ts
---
# POST /api/v1/auth/logout
Exige `Authorization: Bearer <token>` normal ou restrito; sem corpo, path ou query. Retorna `200` com `data:null` e revoga somente a sessão apresentada. Token inválido ou já revogado retorna `401 AUTH_UNAUTHENTICATED`.
