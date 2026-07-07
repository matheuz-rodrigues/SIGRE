from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


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
	JWT_EXPIRES_MINUTES: int = 120

	# Senha do administrador inicial (campusananindeua@uepa.br).
	# Obrigatória; se vazia o admin não é criado no startup.
	ADMIN_SEED_PASSWORD: str = ""

	# Senha padrão atribuída a professores criados via importação de planilha.
	# O administrador deve comunicá-la aos professores para o primeiro acesso.
	PROFESSOR_DEFAULT_PASSWORD: str = ""

	GOOGLE_CLIENT_ID: str = ""
	GOOGLE_CLIENT_SECRET: str = ""
	GOOGLE_REDIRECT_URI: str = "http://localhost:8000/google/callback"
	GOOGLE_TOKEN_URI: str = "https://oauth2.googleapis.com/token"
	GOOGLE_CALENDAR_ID: str = "primary"  # 'primary' = calendário principal do usuário autenticado (nunca dá 404)
	# Para onde o Google OAuth redireciona o usuário após salvar as credenciais (SPA)
	FRONTEND_PUBLIC_URL: str = "http://localhost:8080"

	# Lista de tipos de sala configuráveis (ex.: ["laboratorio","auditorio"])
	ROOM_TYPES: list[str] = ["laboratorio","auditorio"]


@lru_cache
def get_settings() -> Settings:
	return Settings()


