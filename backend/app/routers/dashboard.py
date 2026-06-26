from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.try_database import get_db
from app.models import Alocacao, Sala, Usuario
from app.services.auth.rbac import require_role_exact, ROLE_ADMIN

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/metrics")
def get_metrics(db: Session = Depends(get_db), current=Depends(require_role_exact(ROLE_ADMIN))):
    total_allocations = db.query(func.count(Alocacao.id)).scalar()
    
    status_distribution = db.query(
        Alocacao.status, func.count(Alocacao.id)
    ).group_by(Alocacao.status).all()
    
    status_dict = {status: count for status, count in status_distribution}
    
    room_allocations = db.query(
        Sala.codigo_sala, func.count(Alocacao.id)
    ).join(Alocacao, Alocacao.fk_sala == Sala.id).group_by(Sala.codigo_sala).all()
    
    room_dict = {room: count for room, count in room_allocations}
    
    type_distribution = db.query(
        Alocacao.tipo, func.count(Alocacao.id)
    ).group_by(Alocacao.tipo).all()
    
    type_dict = {tipo: count for tipo, count in type_distribution}
    
    return {
        "total": total_allocations,
        "status": status_dict,
        "rooms": room_dict,
        "types": type_dict
    }
