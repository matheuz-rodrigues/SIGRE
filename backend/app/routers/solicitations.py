from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.orm import Session
from typing import List
from app.try_database import get_db
from app.schemas.solicitation import SolicitationCreate, SolicitationOut, SolicitationUpdateStatus
from app.services.solicitation_service import solicitation_service
from app.services.rbac import get_current_user

router = APIRouter(prefix="/solicitations", tags=["solicitations"])

@router.post("/", response_model=SolicitationOut, status_code=status.HTTP_201_CREATED)
def create(payload: SolicitationCreate, db: Session = Depends(get_db)):
    """Cria uma nova solicitação de sala."""
    return solicitation_service.create_solicitation(db, payload)

@router.get("/mine", response_model=List[SolicitationOut])
def list_mine(email: str = Query(...), db: Session = Depends(get_db)):
    """Lista as solicitações de um usuário específico via e-mail."""
    return solicitation_service.list_my_solicitations(db, email)


@router.patch("/{id}/status", response_model=SolicitationOut)
def update_status(
    id: int, 
    payload: SolicitationUpdateStatus, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Atualiza o status de uma solicitação (Aprovar/Recusar)."""
    return solicitation_service.update_status(db, id, payload, current_user)

@router.get("/", response_model=List[SolicitationOut])
def list_all(status: str = None, db: Session = Depends(get_db)):
    """Lista todas as solicitações (Admin)."""
    return solicitation_service.repository.list_all_with_sala(db, status=status)
