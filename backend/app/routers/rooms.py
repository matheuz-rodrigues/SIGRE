"""
Roteador de Salas — Padronizado RESTful.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.try_database import get_db
from app.schemas.room import RoomCreate, RoomUpdate, RoomOut
from app.services.room_service import room_service
from app.services.rbac import require_role, ROLE_USER, ROLE_ADMIN

router = APIRouter(prefix="/rooms", tags=["rooms"])

@router.get("/", response_model=List[RoomOut])
def list_rooms(db: Session = Depends(get_db), _u=Depends(require_role(ROLE_USER))):
    return room_service.get_all(db)

@router.post("/", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def create_room(room: RoomCreate, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    return room_service.create(db, room)

@router.put("/{room_id}", response_model=RoomOut)
def update_room(room_id: int, room: RoomUpdate, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    db_room = room_service.update(db, room_id, room)
    if not db_room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    return db_room

@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(room_id: int, db: Session = Depends(get_db), _u=Depends(require_role(ROLE_ADMIN))):
    success = room_service.delete(db, room_id)
    if not success:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    return None