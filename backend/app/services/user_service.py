from app.services.base_service import BaseService
from app.repositories.user_repository import user_repository
from app.models.user import Usuario
from app.services.security import hash_password, verify_password
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from typing import Optional, Any

class UserService(BaseService[Usuario]):
    def __init__(self):
        super().__init__(user_repository)

    def create_user(self, db: Session, payload: Any) -> Usuario:
        # Validação de domínio
        allowed_domains = ["uepa.br", "paginas.uepa.br"]
        email_domain = payload.email.split("@")[-1].lower() if "@" in payload.email else ""
        if email_domain not in allowed_domains:
            raise HTTPException(
                status_code=403, 
                detail=f"Domínio de e-mail não permitido. Use @uepa.br ou @paginas.uepa.br"
            )

        existing_user = self.repository.get_by_email(db, payload.email)
        if existing_user:
            raise HTTPException(status_code=409, detail="E-mail já cadastrado")
        
        user_data = payload.model_dump()
        if "papel" in user_data:
            from app.services.auth_service import ROLE_MAP
            if user_data["papel"]:
                user_data["tipo_usuario"] = ROLE_MAP.get(user_data["papel"], user_data.get("tipo_usuario", 1))
            user_data.pop("papel")
        
        if "cursoId" in user_data:
            user_data["fk_curso"] = user_data.pop("cursoId")
        
        if "curso" in user_data:
            user_data.pop("curso")

        user_data["senha"] = hash_password(payload.senha)
        return self.repository.create(db, user_data)

    def update_user(self, db: Session, user_id: int, payload: Any) -> Usuario:
        user = self.get_by_id(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        
        update_data = payload.model_dump(exclude_unset=True)
        if "papel" in update_data:
            from app.services.auth_service import ROLE_MAP
            if update_data["papel"]:
                update_data["tipo_usuario"] = ROLE_MAP.get(update_data["papel"], update_data.get("tipo_usuario"))
            update_data.pop("papel")

        if "cursoId" in update_data:
            update_data["fk_curso"] = update_data.pop("cursoId")

        if "curso" in update_data:
            update_data.pop("curso")

        if "senha" in update_data:
            senha_atual = update_data.pop("senha_atual", None)
            
            if not senha_atual:
                raise HTTPException(status_code=400, detail="Informe a senha atual para alterá-la.")
                
            if not verify_password(senha_atual, user.senha):
                raise HTTPException(status_code=400, detail="Senha atual incorreta.")
                
            update_data["senha"] = hash_password(update_data["senha"])
        else:
            update_data.pop("senha_atual", None)
        
        return self.repository.update(db, user, update_data)

    def set_status(self, db: Session, user_id: int, status_val: str) -> Usuario:
        user = self.get_by_id(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        user.status = status_val
        db.commit()
        db.refresh(user)
        return user

user_service = UserService()
