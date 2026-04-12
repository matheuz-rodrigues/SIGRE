from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.solicitation import Solicitacao
from app.models.user import Usuario
from app.repositories.solicitation_repository import solicitation_repository
from app.schemas.solicitation import SolicitationCreate, SolicitationUpdateStatus
from app.services.base_service import BaseService
from app.services.reservation_service import allocation_service

class SolicitationService(BaseService[Solicitacao]):
    def __init__(self):
        super().__init__(solicitation_repository)

    def create_solicitation(self, db: Session, data: SolicitationCreate) -> Solicitacao:
        # Validar se a sala existe
        from app.models.room import Sala
        room = db.query(Sala).filter(Sala.id == data.salaId).first()
        if not room:
            raise HTTPException(status_code=404, detail="Sala não encontrada.")

        db_data = {
            "solicitante": data.solicitante,
            "email": data.email,
            "matricula": data.matricula,
            "papel": data.papel,
            "motivo": data.motivo,
            "descricao": data.descricao,
            "observacoes": data.observacoes,
            "participantes": data.participantes,
            "dia_semana": data.diaSemana,
            "data_evento": data.dataEvento,
            "horario_inicio": data.horarioInicio,
            "horario_fim": data.horarioFim,
            "fk_sala": data.salaId,
            "fk_curso": data.cursoId,
            "status": "pendente"
        }
        return self.repository.create(db, db_data)

    def list_my_solicitations(self, db: Session, email: str) -> List[Solicitacao]:
        return self.repository.list_by_email(db, email)

    def update_status(self, db: Session, id: int, payload: SolicitationUpdateStatus, admin_user: Usuario) -> Solicitacao:
        solicitacao = self.repository.get_by_id(db, id)
        if not solicitacao:
            raise HTTPException(status_code=404, detail="Solicitação não encontrada")

        status_new = (payload.status or "").strip().lower()

        if status_new == "aprovado":
            if (solicitacao.status or "").lower() != "pendente":
                raise HTTPException(status_code=400, detail="Só é possível aprovar solicitações pendentes.")
            if getattr(solicitacao, "fk_alocacao", None):
                raise HTTPException(status_code=400, detail="Esta solicitação já foi convertida em alocação.")
            aloc_id = allocation_service.create_allocation_from_approved_solicitation(
                db, solicitacao, admin_user
            )
            return self.repository.update(
                db, solicitacao, {"status": "aprovado", "fk_alocacao": aloc_id}
            )

        update_data: dict = {"status": status_new}
        if payload.motivoRecusa is not None:
            update_data["motivo_recusa"] = payload.motivoRecusa
        return self.repository.update(db, solicitacao, update_data)

solicitation_service = SolicitationService()
