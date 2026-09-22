---
title: Login
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/auth/login
source: src/modules/Auth/auth.controller.ts
---
# POST /api/v1/auth/login
Pública (RF001/UC01). Recebe `organizationCode` (texto, 3–50, minúsculo e hífens), `email` (e-mail, até 254) e `password` (texto, 8–128 caracteres; Unicode e espaços permitidos). Sem query ou path. Retorna `200` no envelope com `data.state`, `accessToken`, `tokenType`, `expiresAt` ISO e, em sessão normal, `idleTimeoutSeconds=1800`; `Cache-Control: no-store`. Falhas de organização, conta, estado e senha retornam `401 AUTH_INVALID_CREDENTIALS`; limite retorna `429 AUTH_TEMPORARILY_BLOCKED`; Redis indisponível retorna `503 AUTH_DEPENDENCY_UNAVAILABLE`. Sessão normal expira em 12h absolutas ou 30min sem atividade; primeiro acesso, em 10min.

```bash
curl -X POST https://api.example.com/api/v1/auth/login -H 'Content-Type: application/json' -d '{"organizationCode":"clinica-exemplo","email":"usuario@example.test","password":"senha sintética"}'
```

Origem: controller, `Login/login.dto.ts`, `Login/login.useCase.ts`, `test/auth.e2e-spec.ts`.
