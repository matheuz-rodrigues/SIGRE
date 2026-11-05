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
| Proteger o acesso às contas | Bloqueio progressivo por conta (5 falhas → 30 s, dobrando até 15 min) e por IP (20 falhas/15 min), resposta 429 com `Retry-After`. MFA obrigatório para admin e técnico por código de 6 dígitos enviado ao e-mail da conta (uso único, 10 min, máx. 5 tentativas) | `backend/app/services/auth/rate_limit.py`, `backend/app/services/auth/mfa.py` | — |
| Cabeçalhos de segurança HTTP | API: CSP `default-src 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS. Front (nginx): CSP em Report-Only por padrão, demais cabeçalhos ativos | `backend/app/middleware/security_headers.py`, `frontend/nginx.conf.template` | Trocar `CSP_HEADER_NAME` para `Content-Security-Policy` após validar no ambiente; se o front continuar no CloudFront, configurar uma *response headers policy* equivalente |
| Credenciais e exposição de serviços | Removidos `admin456` e `user/password` dos exemplos e da migração de seed. Segredos fracos ou padrão impedem a subida em produção. `/docs`, `/redoc` e `/openapi.json` desligados em produção. CORS por lista de origens. Usuário comum não altera o próprio papel/status | `.env.example`, `backend/app/config.py`, `backend/app/routers/users.py` | Rotacionar segredos já usados (abaixo); banco sem porta publicada e acessível só pela rede interna |
| Monitoramento e validação | Eventos de login, MFA e cadastro na tabela `auth_events` e em log JSON (`sigra.audit`). Toda requisição que altera dados é registrada com usuário, rota e status | `backend/app/middleware/audit.py`, `backend/app/logging_config.py` | Coletar o stdout dos containers (Loki/CloudWatch), criar os alertas abaixo, revisar segmentação de rede e executar os testes autorizados |

Outros ajustes encontrados na revisão do código:

- `PATCH /users/{id}` permitia que qualquer usuário se promovesse a admin (`tipo_usuario`, `papel`, `status`).
- O cadastro público com `papel=admin` criava um administrador já aprovado.
- O CORS aceitava qualquer origem com credenciais.
- O access token ficava no `localStorage`; agora fica só em cookie `HttpOnly` e o front envia `X-CSRF-Token`.
- O callback do Google imprimia o `state` da sessão no log e devolvia o texto da exceção ao cliente.

Segunda rodada (branch `fix/ajustes-seguranca-dspd`):

- Refresh tokens: o banco guarda só o SHA-256 do token (gerado com `secrets.token_urlsafe`). Reapresentar um
  token já rotacionado/revogado encerra todas as sessões do usuário e gera o evento `auth.refresh.reuse`
  (tolerância de 30 s para duas abas renovando ao mesmo tempo).
- Conta recusada, voltada a pendente ou excluída perde o acesso na hora: `get_current_user` confere o status
  a cada requisição, e recusa/exclusão/troca de status revogam os refresh tokens.
- Troca de senha encerra as sessões dos outros dispositivos; a sessão atual recebe um refresh token novo.
- `GET /users/` restrito a admin e técnico (antes: qualquer usuário autenticado listava nome, e-mail e telefone de todos).
- `POST /solicitations/` exige login; solicitante, e-mail e papel vêm da sessão, não do corpo
  (antes: qualquer pessoa criava solicitações em nome de qualquer e-mail, que apareciam em "Minhas solicitações" da vítima).
- Usuário comum não altera o próprio e-mail ou username (burlava o domínio institucional do cadastro).
- Produção recusa a subida com senha de banco padrão/curta em `DATABASE_URL` e com `PROFESSOR_DEFAULT_PASSWORD` fraca.
- OAuth Google: `state` de uso único; client ID/secret lidos sempre do ambiente e não mais copiados para `google_credentials`.
- Front sem dados no `localStorage`: perfil e token CSRF ficam só em memória (`services/sessionStore.js`) e a sessão
  é restaurada pelo cookie HttpOnly ao recarregar a página. Chaves antigas (`userId`, `userRole`, `adminUser`...) são apagadas.
- Login único: a tela não tem mais abas de perfil (Administrador/Aluno/Professor/Técnico) nem textos que indiquem
  a existência de um painel administrativo; o papel vem do back-end após a autenticação. O cadastro continua com a
  escolha do tipo de conta.
- HSTS enviado sempre pela API (antes só com `ENV=production`) e pelo servidor local do Vite, que agora também
  manda `X-Frame-Options`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`. O navegador ignora HSTS em `http://`.
- Sem os cabeçalhos `Date` e `Server` na API (`uvicorn --no-date-header --no-server-header`) e sem `Date` no Vite.
  O nginx de produção já oculta a versão (`server_tokens off`), mas continua enviando `Date` e `Server: nginx`:
  removê-los exige o módulo `headers-more`, que a imagem `nginx:alpine` não inclui.
- CORS: origem recusada não recebe nenhum cabeçalho `Access-Control-*` (o Starlette devolvia `Allow-Credentials`,
  métodos e headers mesmo recusando) e toda resposta da API tem `Vary: Origin`. O servidor do Vite não responde
  mais a CORS (liberava qualquer origem `localhost`).
- Cookies: todos com `HttpOnly` e `Secure`. `access_token`, `refresh_token` e `csrf_token` com `SameSite=Strict`;
  `sigre_session` (OAuth Google) com `SameSite=Lax`, porque o retorno do Google é uma navegação vinda de outro site.
  O `csrf_token` virou HttpOnly: o front recebe o valor no corpo da resposta e nunca lê `document.cookie`.
  `COOKIE_SECURE` (padrão `true`, obrigatório em produção) só deve ser desligado em desenvolvimento num navegador
  que recuse cookies `Secure` em `http://localhost`; Chrome e Firefox aceitam.

## Fluxo de autenticação

1. `POST /auth/login` valida senha e limite de tentativas.
2. Aluno e professor recebem os cookies `access_token` (HttpOnly, 15 min), `refresh_token` (HttpOnly, path `/auth`, 7 dias, rotacionado a cada uso) e `csrf_token`. O corpo traz o perfil e o `csrf_token`.
3. Admin e técnico recebem um código de 6 dígitos no e-mail da conta e a resposta
   `{mfa_required, mfa_method: "email", email_hint, mfa_token}` (token de 10 min). `POST /auth/mfa/verify` confere o
   código e só então cria a sessão; `POST /auth/mfa/resend` envia um novo código (no mínimo 60 s entre reenvios).
4. Requisições que alteram dados com sessão por cookie exigem `X-CSRF-Token` igual ao cookie e `Origin` permitida.
5. Clientes de API podem usar `POST /auth/token` + `Authorization: Bearer`, exceto perfis com MFA.

Requisito de implantação: front-end e API precisam ser *same-site* (mesmo domínio registrável, por exemplo
`sigra.uepa.br` e `api.sigra.uepa.br`). Os cookies de autenticação usam `SameSite=Strict` e não são enviados em chamadas entre
sites diferentes (por exemplo, front em `*.cloudfront.net` e API em outro domínio).

MFA por e-mail:
- Escolhido no lugar do app autenticador (TOTP) porque o público do sistema tem baixa familiaridade com esses apps;
  não há cadastro prévio nem recuperação de celular perdido.
- O código tem 6 dígitos (`secrets`), vale 10 minutos, é de uso único e fica no banco só como HMAC-SHA256
  (tabela `mfa_codes`, um código ativo por usuário). Cada código aceita 5 tentativas erradas; o bloqueio
  progressivo por usuário (`auth_events`, tipo `mfa`) continua valendo.
- Envios limitados a 5 por usuário a cada 15 min, e o reenvio exige 60 s desde o último (eventos `mfa_send`).
  Um segundo login seguido reaproveita o código ainda válido em vez de mandar outro e-mail.
- A segurança do segundo fator passa a depender da conta de e-mail institucional: perfis administrativos devem
  ter senha forte (e, se o provedor permitir, MFA) no e-mail.

## Servidor de e-mail (código de MFA)

A configuração é só por variáveis de ambiente (`SMTP_*`); trocar de provedor não exige mudar código.
Para validar um servidor sem depender do login: `python scripts/test_smtp.py destino@exemplo.com`
(no container: `docker exec -it sigra_backend python3 scripts/test_smtp.py destino@exemplo.com`).

**Teste temporário na AWS (Amazon SES, `us-east-1`)**

1. No SES, verifique a identidade do remetente. Enquanto a conta estiver em *sandbox*, verifique também cada
   destinatário (ou peça a saída do sandbox).
2. Em *SMTP settings*, gere as credenciais SMTP (são diferentes das chaves de acesso da AWS).
3. Na task definition `sigra-prod-backend`: `SMTP_HOST=email-smtp.us-east-1.amazonaws.com`, `SMTP_PORT=587`,
   `SMTP_STARTTLS=true`, `SMTP_FROM` com o remetente verificado; `SMTP_USER` e `SMTP_PASSWORD` como `secrets`
   (Secrets Manager/SSM), não em `environment`.
4. Não use remetente `@uepa.br` pelo SES: sem SPF/DKIM do domínio autorizando o SES, o e-mail cai no spam ou é
   recusado (principalmente pelo `@aluno.uepa.br`).
5. O `cd.yml` interrompe o deploy se a task definition não tiver `JWT_SECRET`, `SESSION_SECRET`, `CORS_ORIGINS`
   ou `SMTP_HOST`.

**Implantação na DSPD**

- Trocar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` pelos dados do servidor da UEPA,
  com remetente `nao-responda@uepa.br` (ou outro definido pela DSPD) autorizado no SPF/DKIM do domínio.
- Relay interno liberado por IP: deixar `SMTP_USER`/`SMTP_PASSWORD` vazios.
- Em produção a API exige STARTTLS (587) ou SSL (465, `SMTP_SSL=true`). Confirmar com a DSPD que o relay
  oferece TLS; se não oferecer, a API não sobe e o ponto precisa ser tratado com eles.

## Variáveis de ambiente novas

| Variável | Obrigatória em produção | Descrição |
|---|---|---|
| `SESSION_SECRET` | Sim | Segredo do cookie de sessão do OAuth Google. Diferente de `JWT_SECRET` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Sim (`SMTP_HOST`) | Servidor de e-mail para o código de MFA |
| `SMTP_STARTTLS` / `SMTP_SSL` | Um dos dois em produção | STARTTLS na 587 (padrão) ou TLS direto na 465 |
| `CORS_ORIGINS` | Sim | Lista JSON das origens `https://` do front |
| `TURNSTILE_SECRET_KEY` | Se o cadastro público estiver ligado | Chave secreta do Cloudflare Turnstile |
| `PUBLIC_REGISTRATION_ENABLED` | Não (padrão `true`) | Liga/desliga `POST /auth/register` |
| `ALLOWED_EMAIL_DOMAINS` | Não | Domínios aceitos no cadastro |
| `ENABLE_DOCS` | Não (padrão `false`) | Expõe `/docs` em produção (apenas homologação interna) |
| `FORWARDED_ALLOW_IPS` | Sim, atrás de proxy | IPs do proxy reverso confiável, para o IP real no rate limit |
| `MFA_REQUIRED_ROLES` | Não (padrão `[3,4]`) | Papéis com MFA obrigatório |
| `MFA_CODE_TTL_MINUTES`, `MFA_CODE_MAX_ATTEMPTS`, `MFA_RESEND_COOLDOWN_SECONDS`, `MFA_MAX_SENDS_PER_WINDOW` | Não | Validade, tentativas e limites de envio do código |
| `LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_*`, `LOGIN_MAX_FAILURES_PER_IP`, `REGISTER_MAX_PER_IP_PER_HOUR` | Não | Limites de tentativas |
| `API_ORIGIN`, `CSP_HEADER_NAME` (container do front) | Sim / Não | Origem da API liberada no CSP; modo do CSP |

Com `ENV=production`, a API recusa a subida quando `JWT_SECRET` ou `SESSION_SECRET` são padrão ou têm menos de
32 caracteres, quando os dois são iguais, sem `SMTP_HOST` (ou SMTP sem TLS), sem Turnstile com o cadastro ligado ou com
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
2. Troque a senha do usuário do banco: `ALTER USER <POSTGRES_USER> WITH PASSWORD '<NOVA_SENHA>';` e atualize `DATABASE_URL`.
3. No Google Cloud Console, gere um novo client secret do OAuth, atualize `GOOGLE_CLIENT_SECRET` e revogue o antigo.
4. Reinicie a API. Trocar `JWT_SECRET` invalida os access tokens. Para encerrar todas as sessões, revogue os refresh tokens:
   `UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL;`
5. Se o admin inicial foi criado com senha de exemplo, troque a senha pelo painel e remova `ADMIN_SEED_PASSWORD` do ambiente.

Na primeira implantação desta versão (o `init.sh` usa `create_all` + `alembic stamp`, então rode manualmente):

```sql
-- Refresh tokens antigos estavam em texto puro e não são mais aceitos (todos fazem login de novo)
DELETE FROM refresh_tokens WHERE revoked_at IS NULL OR expires_at < now();
-- O client secret do Google não fica mais no banco
UPDATE google_credentials SET client_id = NULL, client_secret = NULL;
-- MFA por app autenticador substituído pelo código por e-mail (a tabela mfa_codes é criada no startup)
DROP TABLE IF EXISTS user_mfa;
```

## Alertas sugeridos

Os logs da API saem em JSON no stdout. Exemplos em LogQL (Loki), assumindo o rótulo `container="sigra_backend"`:

```logql
# Pico de falhas de login (possível força bruta)
sum(count_over_time({container="sigra_backend"} | json | message="auth.login.failure" [5m])) > 30

# Contas ou IPs bloqueados
sum(count_over_time({container="sigra_backend"} | json | message=~"auth\\..*\\.locked" [10m])) > 0

# Refresh token reutilizado (provável roubo de sessão; todas as sessões do usuário foram encerradas)
sum(count_over_time({container="sigra_backend"} | json | message="auth.refresh.reuse" [10m])) > 0

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

- O cadastro público aceita o papel `tecnico_adm` (fica pendente). Como o técnico passa nas checagens de admin
  por nível mínimo, aprovar um cadastro desses por engano dá acesso quase administrativo. Avaliar se técnicos
  devem ser criados só pelo admin.
- `PROFESSOR_DEFAULT_PASSWORD` é uma senha compartilhada pelos professores importados por planilha. O ideal é
  obrigar a troca no primeiro acesso (exige mudança no front) ou deixá-la vazia e usar um fluxo de redefinição.
- O MFA por e-mail é tão forte quanto a conta de e-mail: quem tiver a senha do SIGRA e acesso ao e-mail do
  admin entra. Avaliar exigir MFA no e-mail institucional dos perfis administrativos.
- A CSP do front usa `style-src 'unsafe-inline'` (sonner e Radix injetam `<style>`); o plano previa `style-src 'self'`.
- A porta da API (`BACKEND_PORT`) é publicada em todas as interfaces no `docker-compose.prod.yml`; se o proxy
  do Data Center estiver no mesmo host, publicar só em `127.0.0.1`.
