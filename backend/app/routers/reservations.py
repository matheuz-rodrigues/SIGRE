"""
Roteador de Alocações (Reservas/Horários) — Padronizado RESTful.
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.try_database import get_db
from app.schemas.reservation import ReservationCreate, ReservationUpdate, ReservationOut
from app.services.reservation_service import allocation_service
from app.services.rbac import require_role, ROLE_USER, ROLE_ADMIN

router = APIRouter(prefix="/reservations", tags=["reservations"])

@router.get("/", response_model=dict, summary="Listar reservas")
def list_reservations(
    room_id: Optional[int] = Query(None, alias="roomId"),
    user_id: Optional[int] = Query(None, alias="userId"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to: Optional[datetime] = Query(None, alias="to"),
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_role(ROLE_USER))
):
    """
    Retorna lista de reservas filtradas.
    O retorno é um objeto {"items": [...]} para compatibilidade com o frontend.
    """
    return allocation_service.list_reservations(
        db=db,
        current_user=current_user,
        room_id=room_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        status_filter=status
    )

@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_reservation(
    payload: ReservationCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_role(ROLE_USER))
):
    return allocation_service.create_reservation(db, payload, current_user)


@router.patch("/{reservation_id}", response_model=dict)
def update_reservation(
    reservation_id: str,
    payload: ReservationUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLE_USER)),
):
    return allocation_service.update_reservation(db, reservation_id, payload, current_user)


@router.patch("/approve/{reservation_id}")
def approve_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_role(ROLE_ADMIN))
):
    return allocation_service.approve_reservation(db, reservation_id, current_user)

@router.patch("/refuse/{reservation_id}")
def refuse_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    _u = Depends(require_role(ROLE_ADMIN))
):
    return allocation_service.reject_reservation(db, reservation_id)

@router.delete("/{reservation_id}")
def delete_reservation(
    reservation_id: str,
    delete_series: bool = Query(False, alias="deleteSeries"),
    db: Session = Depends(get_db),
    current_user = Depends(require_role(ROLE_USER))
):
    allocation_service.delete_reservation(db, reservation_id, delete_series, current_user)
    return {"message": "Deletado com sucesso"}
