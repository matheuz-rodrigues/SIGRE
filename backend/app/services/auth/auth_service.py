from typing import Optional, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user import Usuario
from app.schemas.user import UserCreate
from app.services.auth.security import verify_password, hash_password, create_access_token, create_refresh_token

# Mapeamento de Papéis
ROLE_MAP = {
    "aluno": 1,
    "professor": 2,
    "admin": 3,
    "tecnico_adm": 4,
}

REVERSE_ROLE_MAP = {v: k for k, v in ROLE_MAP.items()}

class AuthService:
    def login(self, db: Session, login_data: Any) -> dict:
        # Busca por username ou email
        user = db.query(Usuario).filter(
            (Usuario.username == login_data.username) | (Usuario.email == login_data.username)
        ).filter(Usuario.deleted_at.is_(None)).first()

        if not user or not verify_password(login_data.senha, user.senha):
            raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")

        if user.tipo_usuario != 3:
            if user.status == "pendente":
                raise HTTPException(status_code=401, detail="Sua conta aguarda aprovação do administrador")
            elif user.status == "recusado":
                raise HTTPException(status_code=401, detail="Sua conta foi recusada pelo administrador")
            elif user.status != "aprovado":
                raise HTTPException(status_code=401, detail="Sua conta ainda não está habilitada")

        papel = REVERSE_ROLE_MAP.get(user.tipo_usuario, "aluno")
        access_token = create_access_token(subject=user.email, user_id=user.id, role=user.tipo_usuario)
        refresh_token = create_refresh_token(db, user.id)
        
        return {
            "id": user.id,
            "nome": user.nome,
            "email": user.email,
            "username": user.username,
            "papel": papel,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer"
        }

    def register(self, db: Session, data: UserCreate) -> Usuario:
        # Verificações de duplicidade
        if db.query(Usuario).filter(Usuario.email == data.email).first():
            raise HTTPException(status_code=409, detail="E-mail já cadastrado")
        if db.query(Usuario).filter(Usuario.username == data.username).first():
            raise HTTPException(status_code=409, detail="Nome de usuário já em uso")

        # Mapeamento de papel (suporta tanto string quanto o tipo_usuario int)
        tipo = data.tipo_usuario
        if data.papel:
            tipo = ROLE_MAP.get(data.papel, tipo)

        
        # Admin sempre aprovado (ou conforme regra de negócio, mas aqui vamos deixar pendente se for via cadastro aberto)
        # No frontend admin não cadastra, então assumimos aluno/professor
        status_val = "pendente"
        if tipo in (3, 4):  # admin e tecnico_adm já entram aprovados
            status_val = "aprovado"

        user_obj = Usuario(
            nome=data.nome,
            email=data.email,
            username=data.username,
            telefone=data.telefone,
            senha=hash_password(data.senha),
            tipo_usuario=tipo,
            fk_curso=data.cursoId,
            departamento=data.departamento,
            status=status_val
        )
        
        db.add(user_obj)
        db.commit()
        db.refresh(user_obj)
        return user_obj

auth_service = AuthService()
