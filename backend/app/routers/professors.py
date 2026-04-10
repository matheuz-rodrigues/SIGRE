"""
Roteador de Professores — Padronizado RESTful.
Utiliza Service e Repository Patterns.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.try_database import get_db
from app.schemas.professor import ProfessorCreate, ProfessorUpdate, ProfessorOut
from app.services.professor_service import professor_service
from app.services.rbac import require_role, ROLE_USER, ROLE_ADMIN

router = APIRouter(prefix="/professors", tags=["professors"])

@router.get("/", response_model=List[ProfessorOut], summary="Listar todos os professores")
def list_professors(db: Session = Depends(get_db), _u=Depends(require_role(ROLE_USER))):
    return professor_service.get_all(db)

@router.post("/", response_model=ProfessorOut, status_code=status.HTTP_201_CREATED, summary="Criar novo professor")
def create_professor(professor: ProfessorCreate, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    return professor_service.create(db, professor)

@router.put("/{professor_id}", response_model=ProfessorOut, summary="Atualizar professor")
def update_professor(professor_id: int, professor: ProfessorUpdate, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    db_professor = professor_service.update(db, professor_id, professor)
    if not db_professor:
        raise HTTPException(status_code=404, detail="Professor não encontrado")
    return db_professor

@router.delete("/{professor_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Excluir professor")
def delete_professor(professor_id: int, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    success = professor_service.delete(db, professor_id)
    if not success:
        raise HTTPException(status_code=404, detail="Professor não encontrado")
    return None
