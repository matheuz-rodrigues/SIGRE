from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


# Valores que nunca podem chegar a produção (exemplos e defaults antigos).
_INSECURE_SECRETS = {"", "change_me_super_secret", "changeme", "secret"}


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
	# Token de desafio entre a senha e o código MFA
	JWT_MFA_EXPIRES_MINUTES: int = 5

	# Segredo do cookie de sessão usado apenas no fluxo OAuth do Google.
	# Deve ser diferente de JWT_SECRET.
	SESSION_SECRET: str = "change_me_super_secret"

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

	# MFA (TOTP). Papéis obrigados a usar MFA: 3=admin, 4=tecnico_adm.
	MFA_REQUIRED_ROLES: list[int] = [3, 4]
	MFA_ISSUER_NAME: str = "SIGRA UEPA"
	# Chave Fernet (base64, 32 bytes) para cifrar os segredos TOTP no banco.
	# Gerar com: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
	MFA_ENCRYPTION_KEY: str = ""

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
		if self.MFA_REQUIRED_ROLES and not self.MFA_ENCRYPTION_KEY:
			errors.append("MFA_ENCRYPTION_KEY é obrigatória quando há papéis com MFA obrigatório")
		if self.PUBLIC_REGISTRATION_ENABLED and not self.TURNSTILE_SECRET_KEY:
			errors.append("TURNSTILE_SECRET_KEY é obrigatória com o cadastro público habilitado")
		if any(o.startswith("http://") for o in self.allowed_origins):
			errors.append("Origens do front-end devem usar HTTPS em produção")
		if self.GOOGLE_CLIENT_ID and not self.GOOGLE_REDIRECT_URI.startswith("https://"):
			errors.append("GOOGLE_REDIRECT_URI deve usar HTTPS em produção")
		if errors:
			raise RuntimeError("Configuração insegura para produção: " + "; ".join(errors))


@lru_cache
def get_settings() -> Settings:
	return Settings()
