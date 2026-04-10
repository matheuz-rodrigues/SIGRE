"""
Roteador de Disciplinas — Padronizado RESTful.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.try_database import get_db
from app.schemas.discipline import DisciplineCreate, DisciplineUpdate, DisciplineOut
from app.services.discipline_service import discipline_service
from app.services.rbac import require_role, ROLE_USER, ROLE_ADMIN

router = APIRouter(prefix="/disciplines", tags=["disciplines"])

@router.get("/", response_model=List[DisciplineOut])
def list_disciplines(db: Session = Depends(get_db), _u=Depends(require_role(ROLE_USER))):
    return discipline_service.get_all(db)

@router.post("/", response_model=DisciplineOut, status_code=status.HTTP_201_CREATED)
def create_discipline(discipline: DisciplineCreate, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    return discipline_service.create(db, discipline)

@router.put("/{discipline_id}", response_model=DisciplineOut)
def update_discipline(discipline_id: int, discipline: DisciplineUpdate, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    db_discipline = discipline_service.update(db, discipline_id, discipline)
    if not db_discipline:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada")
    return db_discipline

@router.delete("/{discipline_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_discipline(discipline_id: int, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    success = discipline_service.delete(db, discipline_id)
    if not success:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada")
    return None
