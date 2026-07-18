"""
Roteador de Usuários — Padronizado RESTful.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.try_database import get_db
from app.schemas.user import UserCreate, UserUpdate, UserOut
from app.services.entities.user_service import user_service
from app.services.auth.rbac import get_current_user, require_role, require_role_exact, ROLE_ADMIN, ROLE_USER

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me", response_model=UserOut)
def get_me(current_user = Depends(get_current_user)):
    return current_user

@router.get("/", response_model=List[UserOut])
def list_users(
    tipo_usuario: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _u = Depends(require_role(ROLE_USER))
):
    return user_service.repository.list_active(db, tipo_usuario)

@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _admin = Depends(require_role_exact(ROLE_ADMIN))
):
    return user_service.create_user(db, payload)

@router.patch("/{user_id}", response_model=UserOut) 
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if current_user.id != user_id and current_user.tipo_usuario != ROLE_ADMIN:
         raise HTTPException(status_code=403, detail="Sem permissão")

    if current_user.tipo_usuario == ROLE_ADMIN and current_user.id != user_id:
        target = user_service.get_by_id(db, user_id)
        if not target:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        if target.tipo_usuario == ROLE_ADMIN:
            raise HTTPException(status_code=403, detail="Administradores não podem editar outros administradores")

    return user_service.update_user(db, user_id, payload)

@router.patch("/approve/{user_id}", response_model=UserOut)
def approve_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin = Depends(require_role_exact(ROLE_ADMIN))
):
    return user_service.set_status(db, user_id, "aprovado")

@router.patch("/refuse/{user_id}", response_model=UserOut)
def refuse_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin = Depends(require_role_exact(ROLE_ADMIN))
):
    return user_service.set_status(db, user_id, "recusado")

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin = Depends(require_role_exact(ROLE_ADMIN))
):
    if _admin.id == user_id:
        raise HTTPException(status_code=403, detail="Você não pode apagar sua própria conta")
    user = user_service.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.tipo_usuario == ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Administradores não podem excluir outros administradores")
    user_service.repository.soft_delete(db, user)
    return None