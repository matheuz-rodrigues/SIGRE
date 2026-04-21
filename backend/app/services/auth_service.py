from typing import Optional, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user import Usuario
from app.schemas.user import UserCreate
from app.services.security import verify_password, hash_password, create_access_token

# Mapeamento de Papéis
ROLE_MAP = {
    "aluno": 1,
    "professor": 2,
    "admin": 3
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

        if user.status != "aprovado" and user.tipo_usuario != 3:
            raise HTTPException(status_code=403, detail="Sua conta aguarda aprovação do administrador")

        papel = REVERSE_ROLE_MAP.get(user.tipo_usuario, "aluno")
        access_token = create_access_token(subject=user.email, user_id=user.id, role=user.tipo_usuario)
        
        return {
            "id": user.id,
            "nome": user.nome,
            "email": user.email,
            "username": user.username,
            "papel": papel,
            "access_token": access_token,
            "token_type": "bearer"
        }

    def register(self, db: Session, data: UserCreate) -> Usuario:
        # Validação de domínio
        allowed_domains = ["uepa.br", "paginas.uepa.br"]
        email_domain = data.email.split("@")[-1].lower() if "@" in data.email else ""
        if email_domain not in allowed_domains:
            raise HTTPException(
                status_code=403, 
                detail=f"Domínio de e-mail não permitido. Use @uepa.br ou @paginas.uepa.br"
            )

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
        if tipo == 3:
            status_val = "aprovado"

        user_obj = Usuario(
            nome=data.nome,
            email=data.email,
            username=data.username,
            telefone=data.telefone,
            senha=hash_password(data.senha),
            tipo_usuario=tipo,
            matricula=data.matricula,
            fk_curso=data.cursoId,
            siape=data.siape,
            departamento=data.departamento,
            status=status_val
        )
        
        db.add(user_obj)
        db.commit()
        db.refresh(user_obj)
        return user_obj

auth_service = AuthService()
