import os
import logging
from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware
from app.config import get_settings
from app.try_database import Base, engine
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from app.logging_config import configure_logging
from app.middleware.audit import AuditMiddleware
from app.middleware.csrf import CSRFMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers import (
    auth, users, rooms, reservations, calendar, google,
    room_types, dashboard, professors, disciplines,
    courses, reports, periods, solicitations
)

settings = get_settings()
settings.validate_for_production()
configure_logging()

# Transporte HTTP no OAuth só para desenvolvimento local (redirect em http://localhost)
if settings.ENV == "development" and settings.GOOGLE_REDIRECT_URI.startswith("http://localhost"):
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

logger = logging.getLogger(__name__)

_ADMIN_EMAIL = "campusananindeua@uepa.br"
_ADMIN_USERNAME = "admin"
_ADMIN_NAME = "Campus Ananindeua"


def _seed_admin() -> None:
    """Garante que o administrador padrão exista ao iniciar a aplicação."""
    from app.try_database import SessionLocal
    from app.models.user import Usuario
    from app.services.auth.security import hash_password
    from app.schemas.user import validar_senha_forte

    password = settings.ADMIN_SEED_PASSWORD.strip()
    if not password:
        logger.warning(
            "ADMIN_SEED_PASSWORD não definida — administrador padrão não foi criado."
        )
        return
    try:
        validar_senha_forte(password)
    except ValueError as exc:
        logger.error("ADMIN_SEED_PASSWORD rejeitada (%s) — administrador padrão não foi criado.", exc)
        return

    db = SessionLocal()
    try:
        if db.query(Usuario).filter(Usuario.email == _ADMIN_EMAIL).first():
            return
        db.add(Usuario(
            nome=_ADMIN_NAME,
            email=_ADMIN_EMAIL,
            username=_ADMIN_USERNAME,
            senha=hash_password(password),
            tipo_usuario=3,
            status="aprovado",
        ))
        db.commit()
        logger.info("Administrador padrão criado: %s", _ADMIN_EMAIL)
    except Exception:
        db.rollback()
        logger.exception("Erro ao criar administrador padrão.")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine, checkfirst=True)
    _seed_admin()
    yield

docs_enabled = not settings.is_production or settings.ENABLE_DOCS
app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)

# Ordem: o último adicionado é o mais externo (CORS precisa responder antes do CSRF)
app.add_middleware(CSRFMiddleware, allowed_origins=settings.allowed_origins)
# Fora do CSRF para também registrar as requisições rejeitadas por ele
app.add_middleware(AuditMiddleware)
app.add_middleware(
    SessionMiddleware, 
    secret_key=settings.SESSION_SECRET,
    session_cookie="sigre_session",
    same_site="lax",
    https_only=settings.is_production,
    max_age=3600
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
    expose_headers=["Retry-After"],
)
app.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)

app.include_router(solicitations.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(rooms.router)
app.include_router(room_types.router)
app.include_router(reservations.router)
app.include_router(calendar.router)
app.include_router(google.router)
app.include_router(dashboard.router)
app.include_router(professors.router)
app.include_router(disciplines.router)
app.include_router(courses.router)
app.include_router(reports.router)
app.include_router(periods.router)

@app.get("/health")
def health():
	return {"status": "ok"}
