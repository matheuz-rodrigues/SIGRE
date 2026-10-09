# Segurança do SIGRA — ajustes da análise DSPD/UEPA

Este documento relaciona cada ponto do relatório da DSPD ao que foi implementado no repositório,
lista as variáveis de ambiente novas e o que ainda depende da infraestrutura do Data Center.
Os pontos foram verificados localmente (testes automatizados e navegador); a confirmação no
ambiente de implantação faz parte do item 10 do plano de providências.

## Situação por item

| Item do relatório | O que foi feito | Onde | Pendente fora do repositório |
|---|---|---|---|
| Atualizar a biblioteca de autenticação | `python-jose` trocado por `PyJWT`. Algoritmo fixo (HS256), `exp`, `nbf`, `iat`, `iss`, `aud` e `jti` obrigatórios, tipo do token (`access` × `mfa`). Access token de 15 min | `backend/app/services/auth/security.py` | — |
| Exigir conexão segura | `OAUTHLIB_INSECURE_TRANSPORT` só em `ENV=development` com redirect `http://localhost`. Cookies `Secure` em produção. A API não sobe em produção com origens `http://` ou redirect do Google sem HTTPS. HSTS na API e no nginx | `backend/app/main.py`, `backend/app/config.py` | TLS e redirecionamento HTTP→HTTPS no proxy do Data Center |
| Proteger o cadastro | Cadastro nunca cria admin, sempre fica `pendente`, só aceita e-mails `@uepa.br`/`@aluno.uepa.br` (aluno exige `@aluno.uepa.br`), Turnstile verificado no servidor, limite por IP e flag para desligar | `backend/app/services/auth/auth_service.py` | Decisão da gestão sobre manter o cadastro público |
| Proteger o acesso às contas | Bloqueio progressivo por conta (5 falhas → 30 s, dobrando até 15 min) e por IP (20 falhas/15 min), resposta 429 com `Retry-After`. MFA TOTP obrigatório para admin e técnico, com proteção contra reutilização do código | `backend/app/services/auth/rate_limit.py`, `backend/app/services/auth/mfa.py` | — |
| Cabeçalhos de segurança HTTP | API: CSP `default-src 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS. Front (nginx): CSP em Report-Only por padrão, demais cabeçalhos ativos | `backend/app/middleware/security_headers.py`, `frontend/nginx.conf.template` | Trocar `CSP_HEADER_NAME` para `Content-Security-Policy` após validar no ambiente; se o front continuar no CloudFront, configurar uma *response headers policy* equivalente |
| Credenciais e exposição de serviços | Removidos `admin456` e `user/password` dos exemplos e da migração de seed. Segredos fracos ou padrão impedem a subida em produção. `/docs`, `/redoc` e `/openapi.json` desligados em produção. CORS por lista de origens. Usuário comum não altera o próprio papel/status | `.env.example`, `backend/app/config.py`, `backend/app/routers/users.py` | Rotacionar segredos já usados (abaixo); banco sem porta publicada e acessível só pela rede interna |
| Monitoramento e validação | Eventos de login, MFA e cadastro na tabela `auth_events` e em log JSON (`sigra.audit`). Toda requisição que altera dados é registrada com usuário, rota e status | `backend/app/middleware/audit.py`, `backend/app/logging_config.py` | Coletar o stdout dos containers (Loki/CloudWatch), criar os alertas abaixo, revisar segmentação de rede e executar os testes autorizados |

Outros ajustes encontrados na revisão do código:

- `PATCH /users/{id}` permitia que qualquer usuário se promovesse a admin (`tipo_usuario`, `papel`, `status`).
- O cadastro público com `papel=admin` criava um administrador já aprovado.
- O CORS aceitava qualquer origem com credenciais.
- O access token ficava no `localStorage`; agora fica só em cookie `HttpOnly` e o front envia `X-CSRF-Token`.
- O callback do Google imprimia o `state` da sessão no log e devolvia o texto da exceção ao cliente.

## Fluxo de autenticação

1. `POST /auth/login` valida senha e limite de tentativas.
2. Aluno e professor recebem os cookies `access_token` (HttpOnly, 15 min), `refresh_token` (HttpOnly, path `/auth`, 7 dias, rotacionado a cada uso) e `csrf_token`. O corpo traz o perfil e o `csrf_token`.
3. Admin e técnico recebem `{mfa_required | mfa_setup_required, mfa_token}` (token de 5 min). No primeiro acesso, `POST /auth/mfa/setup` devolve o QR code. `POST /auth/mfa/verify` confere o código e só então cria a sessão.
4. Requisições que alteram dados com sessão por cookie exigem `X-CSRF-Token` igual ao cookie e `Origin` permitida.
5. Clientes de API podem usar `POST /auth/token` + `Authorization: Bearer`, exceto perfis com MFA.

Requisito de implantação: front-end e API precisam ser *same-site* (mesmo domínio registrável, por exemplo
`sigra.uepa.br` e `api.sigra.uepa.br`). Os cookies usam `SameSite=Lax` e não são enviados em chamadas entre
sites diferentes (por exemplo, front em `*.cloudfront.net` e API em outro domínio).

Recuperação do MFA (celular perdido):
- Usuário não admin: `DELETE /users/{id}/mfa` por um administrador.
- Administrador: `docker exec -it sigra_backend python3 scripts/reset_mfa.py <email>`.

## Variáveis de ambiente novas

| Variável | Obrigatória em produção | Descrição |
|---|---|---|
| `SESSION_SECRET` | Sim | Segredo do cookie de sessão do OAuth Google. Diferente de `JWT_SECRET` |
| `MFA_ENCRYPTION_KEY` | Sim | Chave Fernet que cifra os segredos TOTP no banco |
| `CORS_ORIGINS` | Sim | Lista JSON das origens `https://` do front |
| `TURNSTILE_SECRET_KEY` | Se o cadastro público estiver ligado | Chave secreta do Cloudflare Turnstile |
| `PUBLIC_REGISTRATION_ENABLED` | Não (padrão `true`) | Liga/desliga `POST /auth/register` |
| `ALLOWED_EMAIL_DOMAINS` | Não | Domínios aceitos no cadastro |
| `ENABLE_DOCS` | Não (padrão `false`) | Expõe `/docs` em produção (apenas homologação interna) |
| `FORWARDED_ALLOW_IPS` | Sim, atrás de proxy | IPs do proxy reverso confiável, para o IP real no rate limit |
| `MFA_REQUIRED_ROLES` | Não (padrão `[3,4]`) | Papéis com MFA obrigatório |
| `LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_*`, `LOGIN_MAX_FAILURES_PER_IP`, `REGISTER_MAX_PER_IP_PER_HOUR` | Não | Limites de tentativas |
| `API_ORIGIN`, `CSP_HEADER_NAME` (container do front) | Sim / Não | Origem da API liberada no CSP; modo do CSP |

Com `ENV=production`, a API recusa a subida quando `JWT_SECRET` ou `SESSION_SECRET` são padrão ou têm menos de
32 caracteres, quando os dois são iguais, sem `MFA_ENCRYPTION_KEY`, sem Turnstile com o cadastro ligado ou com
origens sem HTTPS.

No deploy da AWS (`.github/workflows/cd.yml`), a task definition `sigra-prod-backend` é reaproveitada: as
variáveis obrigatórias acima precisam ser incluídas nela (de preferência como `secrets` do Secrets Manager/SSM)
**antes** do merge, senão o container não sobe. O build do front lê `VITE_TURNSTILE_SITE_KEY` dos secrets do
repositório e `VITE_CADASTRO_PUBLICO` das variables.

## Rotação de segredos

Execute em cada ambiente compartilhado ou de produção que já tenha usado valores de exemplo:

1. Gere novos valores:
   - `openssl rand -hex 32` para `JWT_SECRET` e, separadamente, para `SESSION_SECRET`
   - `openssl rand -hex 24` para `POSTGRES_PASSWORD`
   - `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` para `MFA_ENCRYPTION_KEY`
2. Troque a senha do usuário do banco: `ALTER USER <POSTGRES_USER> WITH PASSWORD '<NOVA_SENHA>';` e atualize `DATABASE_URL`.
3. No Google Cloud Console, gere um novo client secret do OAuth, atualize `GOOGLE_CLIENT_SECRET` e revogue o antigo.
4. Reinicie a API. Trocar `JWT_SECRET` invalida os access tokens. Para encerrar todas as sessões, revogue os refresh tokens:
   `UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL;`
5. Se o admin inicial foi criado com senha de exemplo, troque a senha pelo painel e remova `ADMIN_SEED_PASSWORD` do ambiente.

A `MFA_ENCRYPTION_KEY` não deve ser trocada sem migração: os segredos TOTP já cadastrados deixariam de ser lidos.
Se for necessário trocá-la, apague a tabela `user_mfa` (`DELETE FROM user_mfa;`) para que todos recadastrem o MFA.

## Alertas sugeridos

Os logs da API saem em JSON no stdout. Exemplos em LogQL (Loki), assumindo o rótulo `container="sigra_backend"`:

```logql
# Pico de falhas de login (possível força bruta)
sum(count_over_time({container="sigra_backend"} | json | message="auth.login.failure" [5m])) > 30

# Contas ou IPs bloqueados
sum(count_over_time({container="sigra_backend"} | json | message=~"auth\\..*\\.locked" [10m])) > 0

# Alterações em usuários (aprovação, exclusão, edição) para revisão periódica
{container="sigra_backend"} | json | message="http.change" | path=~"/users/.*" | status < 400
```

Os mesmos eventos estão em `auth_events` para consultas pontuais, por exemplo:

```sql
SELECT ip, count(*) FROM auth_events
WHERE event_type = 'login' AND success = false AND created_at > now() - interval '1 hour'
GROUP BY ip ORDER BY 2 DESC;
```

## Como validar

- Testes automatizados: `cd backend && pytest -q` (`tests/functional/auth/test_security.py` cobre JWT, CSRF, 429, cadastro, autopromoção, MFA, cabeçalhos e validação de produção).
- Cabeçalhos: `curl -sI https://<HOST_DO_FRONT>/` e `curl -sI https://<HOST_DA_API>/health`.
- CSP: com `CSP_HEADER_NAME=Content-Security-Policy-Report-Only`, navegar pelo sistema e conferir o console do navegador. Sem violações, trocar para `Content-Security-Policy`.

## Decisões registradas

- `tecnico_adm` (4) passa nas checagens `require_role(ROLE_ADMIN)` por nível mínimo e aprova/recusa reservas e solicitações. **Comportamento intencional**, confirmado pelo time; por isso o técnico também tem MFA obrigatório.

## Pontos para o time decidir

- `GET /users/` lista todos os usuários para qualquer usuário autenticado.
- `POST /solicitations/` é público (sem autenticação).
- Refresh tokens são guardados em texto no banco; guardar apenas o hash reduziria o impacto de um vazamento do banco.
