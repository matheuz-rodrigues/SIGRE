from fastapi import HTTPException, status
from typing import Optional
from sqlalchemy.orm import Session
from app.services.base_service import BaseService
from app.repositories.professor_repository import professor_repository
from app.models.professor import Professor
from app.schemas.professor import ProfessorCreate, ProfessorUpdate

class ProfessorService(BaseService[Professor]):
    def __init__(self):
        super().__init__(professor_repository)

    def create(self, db: Session, data: ProfessorCreate) -> Professor:
        if not data.emailProf or not str(data.emailProf).strip():
            raise HTTPException(status_code=400, detail="E-mail do professor é obrigatório")

        if db.query(Professor).filter(Professor.email == data.emailProf).first():
            raise HTTPException(status_code=409, detail="Professor com este e-mail já cadastrado")

        mat = (data.matriculaProf or "").strip() or None
        if mat and db.query(Professor).filter(Professor.matricula == mat).first():
            raise HTTPException(status_code=409, detail="Professor com esta matrícula já cadastrada")

        db_data = {
            "nome": data.nomeProf,
            "email": data.emailProf.strip(),
            "matricula": mat,
        }
        return self.repository.create(db, db_data)

    def update(self, db: Session, id: int, data: ProfessorUpdate) -> Optional[Professor]:
        db_obj = self.repository.get_by_id(db, id)
        if not db_obj:
            return None
        
        update_data = {}
        if data.nomeProf is not None:
            update_data["nome"] = data.nomeProf
        if data.emailProf is not None:
            update_data["email"] = data.emailProf
        if data.matriculaProf is not None:
            m = (data.matriculaProf or "").strip() or None
            update_data["matricula"] = m
            
        return self.repository.update(db, db_obj, update_data)

professor_service = ProfessorService()
