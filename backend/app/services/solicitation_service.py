from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.solicitation import Solicitacao
from app.repositories.solicitation_repository import solicitation_repository
from app.schemas.solicitation import SolicitationCreate, SolicitationUpdateStatus
from app.services.base_service import BaseService
from app.services.reservation_service import allocation_service
from app.models.user import Usuario
from app.schemas.reservation import ReservationCreate
from app.models.room import Sala

class SolicitationService(BaseService[Solicitacao]):
    def __init__(self):
        super().__init__(solicitation_repository)

    def create_solicitation(self, db: Session, data: SolicitationCreate) -> Solicitacao:
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

    def update_status(self, db: Session, id: int, payload: SolicitationUpdateStatus, current_user) -> Solicitacao:
        solicitacao = self.repository.get_by_id(db, id)
        if not solicitacao:
            raise HTTPException(status_code=404, detail="Solicitação não encontrada")
        
        update_data = {"status": payload.status}
        if payload.motivoRecusa:
            update_data["motivo_recusa"] = payload.motivoRecusa
            
        updated = self.repository.update(db, solicitacao, update_data)

        if payload.status == "aprovado":
            requester = db.query(Usuario).filter(Usuario.email == solicitacao.email).first()
            user_id = requester.id if requester else current_user.id

            base_date = solicitacao.data_evento or datetime.now().date()
            start_dt = datetime.combine(base_date, solicitacao.horario_inicio)
            end_dt = datetime.combine(base_date, solicitacao.horario_fim)

            res_payload = ReservationCreate(
                fk_usuario=user_id,
                fk_sala=solicitacao.fk_sala,
                fk_curso=solicitacao.fk_curso,
                tipo=solicitacao.motivo,
                dia_horario_inicio=start_dt,
                dia_horario_saida=end_dt,
                uso=solicitacao.descricao,
                justificativa=solicitacao.observacoes or "",
                status="APPROVED"
            )
            
            allocation_service.create_reservation(db, res_payload, current_user)

        return updated

solicitation_service = SolicitationService()
