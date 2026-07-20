from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.try_database import get_db
from app.schemas.user import UserLogin, UserCreate
from app.services.auth.auth_service import auth_service
from app.services.auth.security import (
    validate_refresh_token, rotate_refresh_token,
    create_access_token, revoke_refresh_token
)
from app.models.user import Usuario
from fastapi.security import OAuth2PasswordRequestForm

router = APIRouter(prefix="/auth", tags=["auth"])


class RefreshTokenRequest(BaseModel):
    refresh_token: str


@router.post("/token")
def login_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Endpoint padrão OAuth2 para obtenção de token."""
    # Mapear form_data para o formato que o service espera
    class LoginData:
        username = form_data.username
        senha = form_data.password
    
    return auth_service.login(db, LoginData())

@router.post("/login")
def login_json(payload: UserLogin, db: Session = Depends(get_db)):
    """Realiza o login via JSON e retorna os dados do usuário + Token JWT."""
    return auth_service.login(db, payload)

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """Cadastra um novo usuário via API pública."""
    user = auth_service.register(db, payload)
    return {"message": "Cadastro realizado com sucesso", "id": user.id}

@router.post("/refresh")
def refresh_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    """
    Troca um refresh token válido por um novo access token + refresh token rotacionado. Retorna 401 se o refresh token for inválido, expirado ou revogado
    """
    user_id = validate_refresh_token(db, payload.refresh_token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido, expirado ou revogado"
        )

    new_refresh_token = rotate_refresh_token(db, payload.refresh_token, user_id)
    if new_refresh_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falha ao rotacionar refresh token"
        )

    user = db.query(Usuario).filter(Usuario.id == user_id, Usuario.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado"
        )

    new_access_token = create_access_token(
        subject=user.email, user_id=user.id, role=user.tipo_usuario
    )

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }

@router.post("/logout")
def logout(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    """Revoga o refresh token no lado do servidor."""
    revoke_refresh_token(db, payload.refresh_token)
    return {"message": "Logout realizado com sucesso"}

