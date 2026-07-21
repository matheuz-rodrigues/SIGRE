from fastapi import APIRouter, Depends, status, HTTPException, Request, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.try_database import get_db
from app.config import get_settings
from app.schemas.user import UserLogin, UserCreate
from app.services.auth.auth_service import auth_service
from app.services.auth.security import (
    validate_refresh_token, rotate_refresh_token,
    create_access_token, revoke_refresh_token
)
from app.models.user import Usuario
from fastapi.security import OAuth2PasswordRequestForm

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

# Cookie config — secure=True apenas em produção (HTTPS)
COOKIE_SECURE = settings.ENV == "production"
COOKIE_SAMESITE = "lax"
COOKIE_HTTPONLY = True
COOKIE_PATH = "/auth"
COOKIE_MAX_AGE = settings.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60  # em segundos


def _set_refresh_cookie(response: Response, token: str):
    """Define o refresh token como cookie HttpOnly na resposta."""
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=COOKIE_HTTPONLY,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=COOKIE_MAX_AGE,
        path=COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response):
    """Remove o cookie de refresh token."""
    response.delete_cookie(
        key="refresh_token",
        path=COOKIE_PATH,
        httponly=COOKIE_HTTPONLY,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )


@router.post("/token")
def login_token(response: Response, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Endpoint padrão OAuth2 para obtenção de token."""
    class LoginData:
        username = form_data.username
        senha = form_data.password
    
    result = auth_service.login(db, LoginData())
    
    # Setar refresh token como cookie HttpOnly
    _set_refresh_cookie(response, result.pop("refresh_token"))
    
    return result


@router.post("/login")
def login_json(payload: UserLogin, response: Response, db: Session = Depends(get_db)):
    """Realiza o login via JSON e retorna os dados do usuário + Token JWT."""
    result = auth_service.login(db, payload)
    
    # Setar refresh token como cookie HttpOnly 
    _set_refresh_cookie(response, result.pop("refresh_token"))
    
    return result


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """Cadastra um novo usuário via API pública."""
    user = auth_service.register(db, payload)
    return {"message": "Cadastro realizado com sucesso", "id": user.id}


@router.post("/refresh")
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Troca um refresh token válido por um novo access token + refresh token rotacionado.
    Lê o refresh token do cookie HttpOnly.
    Retorna 401 se o refresh token for inválido, expirado ou revogado.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token não encontrado"
        )

    user_id = validate_refresh_token(db, token)
    if user_id is None:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido, expirado ou revogado"
        )

    # Rotacionar: revoga o antigo + cria novo
    new_refresh_token = rotate_refresh_token(db, token, user_id)
    if new_refresh_token is None:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falha ao rotacionar refresh token"
        )

    user = db.query(Usuario).filter(Usuario.id == user_id, Usuario.deleted_at.is_(None)).first()
    if not user:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado"
        )

    new_access_token = create_access_token(
        subject=user.email, user_id=user.id, role=user.tipo_usuario
    )

    # Setar novo refresh token como cookie
    _set_refresh_cookie(response, new_refresh_token)

    return {
        "access_token": new_access_token,
        "token_type": "bearer"
    }


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Revoga o refresh token no lado do servidor e limpa o cookie."""
    token = request.cookies.get("refresh_token")
    if token:
        revoke_refresh_token(db, token)
    _clear_refresh_cookie(response)
    return {"message": "Logout realizado com sucesso"}

