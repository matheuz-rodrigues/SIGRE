"""
Roteador de Períodos — Padronizado RESTful.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.try_database import get_db
from app.schemas.period import PeriodCreate, PeriodUpdate, PeriodOut
from app.services.period_service import period_service
from app.services.rbac import require_role, ROLE_USER, ROLE_ADMIN

router = APIRouter(prefix="/periods", tags=["periods"])

@router.get("/", response_model=List[PeriodOut])
def list_periods(db: Session = Depends(get_db), _u=Depends(require_role(ROLE_USER))):
    return period_service.get_all(db)

@router.post("/", response_model=PeriodOut, status_code=status.HTTP_201_CREATED)
def create_period(period: PeriodCreate, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    return period_service.create(db, period)

@router.put("/{period_id}", response_model=PeriodOut)
def update_period(period_id: int, period: PeriodUpdate, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    db_period = period_service.update(db, period_id, period)
    if not db_period:
        raise HTTPException(status_code=404, detail="Período não encontrado")
    return db_period

@router.delete("/{period_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_period(period_id: int, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    success = period_service.delete(db, period_id)
    if not success:
        raise HTTPException(status_code=404, detail="Período não encontrado")
    return None
