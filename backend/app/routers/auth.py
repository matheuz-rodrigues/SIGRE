from typing import Optional

from fastapi import APIRouter, Depends, status, HTTPException, Request, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.try_database import get_db
from app.config import get_settings
from app.schemas.user import UserLogin, UserCreate
from app.services.auth.auth_service import auth_service, new_csrf_token, REVERSE_ROLE_MAP
from app.services.auth import mfa, rate_limit
from app.services.auth.security import (
    validate_refresh_token, rotate_refresh_token,
    create_access_token, revoke_refresh_token,
    decode_token, TOKEN_TYPE_MFA,
)
from app.models.user import Usuario
from fastapi.security import OAuth2PasswordRequestForm

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
CSRF_COOKIE = "csrf_token"

# Cookie config — secure=True apenas em produção (HTTPS)
COOKIE_SECURE = settings.is_production
COOKIE_SAMESITE = "lax"
COOKIE_HTTPONLY = True
COOKIE_PATH = "/auth"
COOKIE_MAX_AGE = settings.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60  # em segundos
ACCESS_COOKIE_MAX_AGE = settings.JWT_ACCESS_EXPIRES_MINUTES * 60


class RegisterRequest(UserCreate):
    turnstileToken: Optional[str] = None


class MfaTokenRequest(BaseModel):
    mfa_token: str


class MfaVerifyRequest(MfaTokenRequest):
    code: str = Field(..., min_length=6, max_length=6)


def _set_refresh_cookie(response: Response, token: str):
    """Define o refresh token como cookie HttpOnly na resposta."""
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        httponly=COOKIE_HTTPONLY,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=COOKIE_MAX_AGE,
        path=COOKIE_PATH,
    )


def _set_session_cookies(response: Response, access_token: str, csrf_token: str):
    """Access token em cookie HttpOnly; token CSRF legível pelo front (double-submit)."""
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=ACCESS_COOKIE_MAX_AGE,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE,
        value=csrf_token,
        httponly=False,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


def _clear_refresh_cookie(response: Response):
    """Remove o cookie de refresh token."""
    response.delete_cookie(
        key=REFRESH_COOKIE,
        path=COOKIE_PATH,
        httponly=COOKIE_HTTPONLY,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )


def _clear_all_cookies(response: Response):
    _clear_refresh_cookie(response)
    for key, httponly in ((ACCESS_COOKIE, True), (CSRF_COOKIE, False)):
        response.delete_cookie(key=key, path="/", httponly=httponly, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE)


def _start_session(response: Response, result: dict) -> dict:
    """Grava os cookies da sessão e remove os tokens do corpo da resposta."""
    _set_refresh_cookie(response, result.pop("refresh_token"))
    _set_session_cookies(response, result.pop("access_token"), result["csrf_token"])
    return result


@router.post("/token")
def login_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Endpoint padrão OAuth2 (clientes de API e /docs). Devolve o token no corpo; sem cookies."""
    user = auth_service.authenticate(db, form_data.username, form_data.password, rate_limit.client_ip(request))
    if mfa.mfa_required_for(user):
        raise HTTPException(status_code=403, detail="Este perfil exige MFA. Use /auth/login.")
    access_token = create_access_token(subject=user.email, user_id=user.id, role=user.tipo_usuario)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/login")
def login_json(payload: UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    """Realiza o login via JSON. Sessão em cookies HttpOnly ou desafio MFA."""
    result = auth_service.login(db, payload, rate_limit.client_ip(request))
    if "mfa_token" in result:
        return result
    return _start_session(response, result)


def _user_from_mfa_token(db: Session, token: str) -> Usuario:
    payload = decode_token(token, expected_type=TOKEN_TYPE_MFA)
    if not payload:
        raise HTTPException(status_code=401, detail="Sessão de verificação expirada. Faça login novamente.")
    user = db.query(Usuario).filter(Usuario.id == payload.get("uid"), Usuario.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Sessão de verificação expirada. Faça login novamente.")
    return user


@router.post("/mfa/setup")
def mfa_setup(payload: MfaTokenRequest, db: Session = Depends(get_db)):
    """Primeiro acesso de perfil com MFA obrigatório: gera o segredo TOTP e o QR code."""
    user = _user_from_mfa_token(db, payload.mfa_token)
    return mfa.start_setup(db, user)


@router.post("/mfa/verify")
def mfa_verify(payload: MfaVerifyRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Confere o código do app autenticador e conclui o login."""
    user = _user_from_mfa_token(db, payload.mfa_token)
    ip = rate_limit.client_ip(request)
    identifier = f"uid:{user.id}"
    rate_limit.ensure_not_locked(db, rate_limit.EVENT_MFA, identifier, ip)

    if not mfa.verify_code(db, user.id, payload.code):
        rate_limit.record_event(db, rate_limit.EVENT_MFA, identifier, ip, success=False, user_id=user.id)
        raise HTTPException(status_code=401, detail="Código inválido")

    rate_limit.record_event(db, rate_limit.EVENT_MFA, identifier, ip, success=True, user_id=user.id)
    return _start_session(response, auth_service.issue_session(db, user))


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    """Cadastra um novo usuário via API pública."""
    user = auth_service.register(db, payload, rate_limit.client_ip(request), payload.turnstileToken)
    return {"message": "Cadastro realizado com sucesso", "id": user.id}


@router.post("/refresh")
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Troca um refresh token válido por um novo access token + refresh token rotacionado.
    Lê o refresh token do cookie HttpOnly.
    Retorna 401 se o refresh token for inválido, expirado ou revogado.
    """
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token não encontrado"
        )

    user_id = validate_refresh_token(db, token)
    if user_id is None:
        _clear_all_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido, expirado ou revogado"
        )

    user = db.query(Usuario).filter(Usuario.id == user_id, Usuario.deleted_at.is_(None)).first()
    if not user or (user.tipo_usuario != 3 and user.status != "aprovado"):
        revoke_refresh_token(db, token)
        _clear_all_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado ou não habilitado"
        )

    # Rotacionar: revoga o antigo + cria novo
    new_refresh_token = rotate_refresh_token(db, token, user_id)
    if new_refresh_token is None:
        _clear_all_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falha ao rotacionar refresh token"
        )

    new_access_token = create_access_token(
        subject=user.email, user_id=user.id, role=user.tipo_usuario
    )
    csrf_token = new_csrf_token()

    # Setar novos cookies
    _set_refresh_cookie(response, new_refresh_token)
    _set_session_cookies(response, new_access_token, csrf_token)

    return {
        "id": user.id,
        "nome": user.nome,
        "email": user.email,
        "username": user.username,
        "papel": REVERSE_ROLE_MAP.get(user.tipo_usuario, "aluno"),
        "csrf_token": csrf_token,
        "token_type": "bearer"
    }


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Revoga o refresh token no lado do servidor e limpa os cookies."""
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        revoke_refresh_token(db, token)
    _clear_all_cookies(response)
    return {"message": "Logout realizado com sucesso"}
