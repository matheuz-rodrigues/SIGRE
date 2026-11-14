"""
Roteador de Salas — Padronizado RESTful.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.try_database import get_db
from app.models.allocation import Alocacao
from app.models.solicitation import Solicitacao
from app.schemas.room import RoomCreate, RoomUpdate, RoomOut
from app.services.entities.room_service import room_service
from app.services.auth.rbac import require_role, require_role_exact, ROLE_USER, ROLE_ADMIN

router = APIRouter(prefix="/rooms", tags=["rooms"])

@router.get("/", response_model=List[RoomOut])
def list_rooms(db: Session = Depends(get_db), _u=Depends(require_role(ROLE_USER))):
    return room_service.get_all(db)

@router.post("/", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def create_room(room: RoomCreate, db: Session = Depends(get_db), _u=Depends(require_role_exact(ROLE_ADMIN))):
    return room_service.create(db, room)

@router.put("/{room_id}", response_model=RoomOut)
def update_room(room_id: int, room: RoomUpdate, db: Session = Depends(get_db), _u=Depends(require_role_exact(ROLE_ADMIN))):
    db_room = room_service.update(db, room_id, room)
    if not db_room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    return db_room

def _plural(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(room_id: int, db: Session = Depends(get_db), _u=Depends(require_role_exact(ROLE_ADMIN))):
    # Reservas e solicitações referenciam a sala; apagar quebraria o histórico
    reservas = db.query(func.count(Alocacao.id)).filter(Alocacao.fk_sala == room_id).scalar()
    solicitacoes = db.query(func.count(Solicitacao.id)).filter(Solicitacao.fk_sala == room_id).scalar()
    if reservas or solicitacoes:
        vinculos = [
            _plural(n, singular, plural)
            for n, singular, plural in ((reservas, "reserva", "reservas"), (solicitacoes, "solicitação", "solicitações"))
            if n
        ]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A sala não pode ser excluída porque está vinculada a {' e '.join(vinculos)}.",
        )
    try:
        success = room_service.delete(db, room_id)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A sala não pode ser excluída: está em uso por outros registros.",
        )
    if not success:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    return None