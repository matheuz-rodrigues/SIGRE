from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


# Valores que nunca podem chegar a produção (exemplos e defaults antigos).
_INSECURE_SECRETS = {"", "change_me_super_secret", "changeme", "secret"}
_INSECURE_DB_PASSWORDS = {"", "password", "postgres", "user", "admin", "changeme"}


class Settings(BaseSettings):
	model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, extra="ignore")

	APP_NAME: str = "AlocacoesUEPA"
	ENV: str = "development"
	HOST: str = "0.0.0.0"
	PORT: int = 8000
	APP_TIMEZONE: str = "America/Belem"
	FRONTEND_URL: str = "http://localhost:8080"

	DATABASE_URL: str = "postgresql://user:password@localhost:5432/alocacoes"

	JWT_SECRET: str = "change_me_super_secret"
	JWT_ALGORITHM: str = "HS256"
	JWT_ISSUER: str = "sigra-api"
	JWT_AUDIENCE: str = "sigra-web"
	JWT_ACCESS_EXPIRES_MINUTES: int = 15
	JWT_REFRESH_EXPIRES_DAYS: int = 7
	# Token de desafio entre a senha e o código MFA (cobre a validade do código enviado por e-mail)
	JWT_MFA_EXPIRES_MINUTES: int = 10

	# Segredo do cookie de sessão usado apenas no fluxo OAuth do Google.
	# Deve ser diferente de JWT_SECRET.
	SESSION_SECRET: str = "change_me_super_secret"

	# Flag Secure nos cookies. Só desligar em desenvolvimento num navegador que recuse
	# cookies Secure em http://localhost (Chrome e Firefox aceitam).
	COOKIE_SECURE: bool = True

	# Origens do front-end autorizadas (CORS e verificação de Origin no CSRF).
	# Se vazio, usa FRONTEND_URL e FRONTEND_PUBLIC_URL.
	CORS_ORIGINS: list[str] = []

	# /docs, /redoc e /openapi.json ficam desligados em produção, salvo se habilitado aqui.
	ENABLE_DOCS: bool = False

	# Senha do administrador inicial (campusananindeua@uepa.br).
	# Obrigatória; se vazia o admin não é criado no startup.
	ADMIN_SEED_PASSWORD: str = ""

	# Senha padrão atribuída a professores criados via importação de planilha.
	# O administrador deve comunicá-la aos professores para o primeiro acesso.
	PROFESSOR_DEFAULT_PASSWORD: str = ""

	# Cadastro público (POST /auth/register)
	PUBLIC_REGISTRATION_ENABLED: bool = True
	ALLOWED_EMAIL_DOMAINS: list[str] = ["uepa.br", "aluno.uepa.br"]
	# Domínio exigido para o papel "aluno"
	STUDENT_EMAIL_DOMAIN: str = "aluno.uepa.br"
	# Chave secreta do Cloudflare Turnstile. Obrigatória em produção com cadastro público.
	TURNSTILE_SECRET_KEY: str = ""
	TURNSTILE_VERIFY_URL: str = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

	# Limitação de tentativas (login, MFA e cadastro)
	LOGIN_MAX_FAILURES: int = 5
	LOGIN_FAILURE_WINDOW_MINUTES: int = 15
	LOGIN_LOCKOUT_BASE_SECONDS: int = 30
	LOGIN_LOCKOUT_MAX_SECONDS: int = 900
	LOGIN_MAX_FAILURES_PER_IP: int = 20
	REGISTER_MAX_PER_IP_PER_HOUR: int = 5

	# MFA por código enviado ao e-mail da conta. Papéis obrigados: 3=admin, 4=tecnico_adm.
	MFA_REQUIRED_ROLES: list[int] = [3, 4]
	MFA_CODE_TTL_MINUTES: int = 10
	# Tentativas erradas aceitas por código antes de invalidá-lo
	MFA_CODE_MAX_ATTEMPTS: int = 5
	# Intervalo mínimo entre dois envios e máximo de envios por usuário na janela de LOGIN_FAILURE_WINDOW_MINUTES
	MFA_RESEND_COOLDOWN_SECONDS: int = 60
	MFA_MAX_SENDS_PER_WINDOW: int = 5

	# SMTP para o envio do código. Obrigatório em produção (com TLS).
	# Fora de produção e sem SMTP_HOST, o código é escrito no log da API.
	SMTP_HOST: str = ""
	SMTP_PORT: int = 587
	SMTP_USER: str = ""
	SMTP_PASSWORD: str = ""
	SMTP_FROM: str = "SIGRA UEPA <nao-responda@uepa.br>"
	# STARTTLS na porta 587 ou TLS direto (SMTP_SSL) na 465
	SMTP_STARTTLS: bool = True
	SMTP_SSL: bool = False
	SMTP_TIMEOUT_SECONDS: int = 10

	GOOGLE_CLIENT_ID: str = ""
	GOOGLE_CLIENT_SECRET: str = ""
	GOOGLE_REDIRECT_URI: str = "http://localhost:8000/google/callback"
	GOOGLE_TOKEN_URI: str = "https://oauth2.googleapis.com/token"
	GOOGLE_CALENDAR_ID: str = "primary"  # 'primary' = calendário principal do usuário autenticado (nunca dá 404)
	# Para onde o Google OAuth redireciona o usuário após salvar as credenciais (SPA)
	FRONTEND_PUBLIC_URL: str = "http://localhost:8080"

	# Lista de tipos de sala configuráveis (ex.: ["laboratorio","auditorio"])
	ROOM_TYPES: list[str] = ["laboratorio","auditorio"]

	@property
	def is_production(self) -> bool:
		return self.ENV == "production"

	@property
	def allowed_origins(self) -> list[str]:
		origins = self.CORS_ORIGINS or [self.FRONTEND_URL, self.FRONTEND_PUBLIC_URL]
		return sorted({o.rstrip("/") for o in origins if o})

	def validate_for_production(self) -> None:
		"""Impede a subida em produção com segredos padrão ou configuração insegura."""
		if not self.is_production:
			return
		errors = []
		for name in ("JWT_SECRET", "SESSION_SECRET"):
			value = getattr(self, name)
			if value in _INSECURE_SECRETS or len(value) < 32:
				errors.append(f"{name} deve ser um segredo aleatório com pelo menos 32 caracteres")
		if self.JWT_SECRET == self.SESSION_SECRET:
			errors.append("SESSION_SECRET deve ser diferente de JWT_SECRET")
		if self.JWT_ALGORITHM != "HS256":
			errors.append("JWT_ALGORITHM deve ser HS256")
		if self.MFA_REQUIRED_ROLES and not self.SMTP_HOST:
			errors.append("SMTP_HOST é obrigatório para enviar o código de MFA por e-mail")
		if self.SMTP_HOST and not (self.SMTP_STARTTLS or self.SMTP_SSL):
			errors.append("O envio de e-mail deve usar SMTP_STARTTLS ou SMTP_SSL em produção")
		if self.PUBLIC_REGISTRATION_ENABLED and not self.TURNSTILE_SECRET_KEY:
			errors.append("TURNSTILE_SECRET_KEY é obrigatória com o cadastro público habilitado")
		if any(o.startswith("http://") for o in self.allowed_origins):
			errors.append("Origens do front-end devem usar HTTPS em produção")
		if self.GOOGLE_CLIENT_ID and not self.GOOGLE_REDIRECT_URI.startswith("https://"):
			errors.append("GOOGLE_REDIRECT_URI deve usar HTTPS em produção")
		if not self.COOKIE_SECURE:
			errors.append("COOKIE_SECURE deve ser true em produção")
		errors.extend(self._database_errors())
		if self.PROFESSOR_DEFAULT_PASSWORD.strip():
			from app.schemas.user import validar_senha_forte
			try:
				validar_senha_forte(self.PROFESSOR_DEFAULT_PASSWORD.strip())
			except ValueError:
				errors.append("PROFESSOR_DEFAULT_PASSWORD deve ser uma senha forte (ou ficar vazia)")
		if errors:
			raise RuntimeError("Configuração insegura para produção: " + "; ".join(errors))

	def _database_errors(self) -> list[str]:
		from sqlalchemy.engine import make_url
		try:
			url = make_url(self.DATABASE_URL)
		except Exception:
			return ["DATABASE_URL inválida"]
		if url.get_backend_name() == "sqlite":
			return []
		password = url.password or ""
		if password.lower() in _INSECURE_DB_PASSWORDS or password.startswith("<") or len(password) < 16:
			return ["A senha do banco em DATABASE_URL deve ser aleatória com pelo menos 16 caracteres"]
		return []


@lru_cache
def get_settings() -> Settings:
	return Settings()
