---
title: Solicitar recuperação de senha
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/auth/password-recovery/request
source: src/modules/Auth/auth.controller.ts
---
# POST /api/v1/auth/password-recovery/request
Pública (RF002/UC02). Corpo: `organizationCode` (3–50) e `email` (até 254); sem path/query. Retorna `202` com envelope e `data:null` sem revelar a existência da conta. Limites retornam `429`; Redis indisponível, `503`. Com SMTP desabilitado não cria token; com SMTP habilitado envia link de uso único válido por 15min.
