"""
Service Layer de Alocações — Padronizado com Design Patterns.
Orquestra Repositório, Regras de Negócio e Google Calendar (paridade 1:1 com eventos aprovados).
"""

from typing import Optional, List, Any
from datetime import datetime, date, time, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from app.models import Alocacao, Sala, Usuario, GoogleCredential
from app.models.solicitation import Solicitacao
from app.repositories.allocation_repository import allocation_repository
from app.builders.reservation_builder import (
    build_local_event,
    expand_local_reservation,
    PLATFORM_EVENT_SOURCE,
    build_event_summary,
    build_event_description,
    build_event_private_metadata,
)
from app.services.calendar import google_calendar
from app.services.infra.datetime_utils import ensure_utc, ensure_app_timezone, from_storage_datetime, to_storage_datetime
from googleapiclient.errors import HttpError as GoogleHttpError
from app.schemas.reservation import ReservationCreate, ReservationUpdate
from app.services.infra.base_service import BaseService
from app.services.auth.rbac import ROLE_ADMIN

# Dias como no frontend (Segunda–Sábado); Python weekday: Segunda=0 … Domingo=6
_DIA_SEMANA_PARA_WEEKDAY = {
    "Segunda": 0,
    "Terça": 1,
    "Quarta": 2,
    "Quinta": 3,
    "Sexta": 4,
    "Sábado": 5,
    "Domingo": 6,
}

_WEEKDAY_TO_RRULE = {
    "Segunda": "MO",
    "Terça": "TU",
    "Quarta": "WE",
    "Quinta": "TH",
    "Sexta": "FR",
    "Sábado": "SA",
    "Domingo": "SU",
}


class AllocationService(BaseService[Alocacao]):
    def __init__(self):
        super().__init__(allocation_repository)

    def _is_platform_event(self, event: dict) -> bool:
        priv = (event.get("extendedProperties") or {}).get("private") or {}
        if priv.get("platform_source") == PLATFORM_EVENT_SOURCE:
            return True
        return bool(priv.get("fk_sala") and priv.get("fk_usuario"))

    def _require_google_credentials(self, db: Session, user_id: int) -> None:
        if google_calendar._get_credentials(db, user_id) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Google Calendar não está conectado para este usuário. "
                    "Em Admin → Calendário, use “Conectar Google Calendar” antes de criar ou aprovar alocações."
                ),
            )

    def _conflicts_google(self, db: Session, user_id: int, sala_id: int, start_dt: datetime, end_dt: datetime) -> bool:
        self._require_google_credentials(db, user_id)
        start_dt = ensure_utc(start_dt)
        end_dt = ensure_utc(end_dt)
        try:
            items = google_calendar.list_events(db=db, user_id=user_id, time_min_utc=start_dt, time_max_utc=end_dt)
        except GoogleHttpError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Erro na API do Google Calendar ({e.resp.status}): {e.reason}. Verifique a configuração do calendário em Admin → Calendário.",
            )
        if items is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "O token do Google Calendar expirou ou foi revogado. "
                    "Por favor, desconecte e conecte novamente em Admin → Calendário."
                ),
            )
        for ev in items:
            priv = (ev.get("extendedProperties") or {}).get("private") or {}
            if str(priv.get("fk_sala")) == str(sala_id):
                return True
        return False

    def list_reservations(
        self,
        db: Session,
        current_user,
        room_id: Optional[int] = None,
        user_id: Optional[int] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        status_filter: Optional[str] = None,
    ) -> dict:
        date_from = date_from or datetime(2000, 1, 1)
        date_to = date_to or datetime(2100, 1, 1)

        from app.services.auth.rbac import ROLE_ADMIN
        is_admin = (current_user.tipo_usuario >= ROLE_ADMIN)

        date_from_local = to_storage_datetime(date_from)
        date_to_local = to_storage_datetime(date_to)

        reservas_db = self.repository.list_in_range(
            db=db,
            date_from_local=date_from_local,
            date_to_local=date_to_local,
            room_id=room_id,
            user_id=user_id,
            status=status_filter,
            is_admin=is_admin,
            current_user_id=current_user.id,
        )

        range_start = from_storage_datetime(date_from_local)
        range_end = from_storage_datetime(date_to_local)
        formatted_items = []
        for res in reservas_db:
            formatted_items.extend(expand_local_reservation(res, range_start, range_end))

        formatted_items.sort(key=lambda ev: ev["start"]["dateTime"])
        return {"items": formatted_items}

    def _solicitation_datetimes(self, solicitacao: Solicitacao) -> tuple[datetime, datetime]:
        """Converte solicitação em intervalo local (com fuso da aplicação) para persistência."""
        dia = (solicitacao.dia_semana or "").strip()
        target_wd = _DIA_SEMANA_PARA_WEEKDAY.get(dia)
        if target_wd is None:
            raise HTTPException(status_code=400, detail=f"Dia da semana inválido na solicitação: {dia}")

        if solicitacao.data_evento:
            d = solicitacao.data_evento
        else:
            ref = date.today()
            d = ref
            for _ in range(14):
                if d.weekday() == target_wd:
                    break
                d += timedelta(days=1)

        start = datetime.combine(d, solicitacao.horario_inicio)
        end = datetime.combine(d, solicitacao.horario_fim)
        if end <= start:
            end += timedelta(days=1)
        return ensure_app_timezone(start), ensure_app_timezone(end)

    def create_allocation_from_approved_solicitation(
        self, db: Session, solicitacao: Solicitacao, admin_user: Usuario
    ) -> int:
        """Cria alocação APPROVED + evento Google; em falha remove a linha local criada."""
        applicant = (
            db.query(Usuario)
            .filter(func.lower(Usuario.email) == (solicitacao.email or "").strip().lower())
            .first()
        )
        if not applicant:
            raise HTTPException(
                status_code=400,
                detail="Não existe usuário cadastrado com o e-mail desta solicitação. Cadastre o usuário antes de aprovar.",
            )

        room = db.query(Sala).filter(Sala.id == solicitacao.fk_sala).first()
        if not room:
            raise HTTPException(status_code=404, detail="Sala da solicitação não encontrada.")

        start_local, end_local = self._solicitation_datetimes(solicitacao)
        data = {
            "fk_usuario": applicant.id,
            "fk_sala": solicitacao.fk_sala,
            "fk_professor": None,
            "fk_disciplina": None,
            "fk_curso": solicitacao.fk_curso,
            "fk_periodo": None,
            "tipo": "SOLICITACAO",
            "dia_horario_inicio": to_storage_datetime(start_local),
            "dia_horario_saida": to_storage_datetime(end_local),
            "dia_semana": solicitacao.dia_semana,
            "data_inicio": to_storage_datetime(start_local.replace(hour=0, minute=0, second=0, microsecond=0)),
            "data_fim": to_storage_datetime(end_local.replace(hour=23, minute=59, second=59, microsecond=0)),
            "uso": (solicitacao.motivo or "Solicitação")[:255],
            "justificativa": (solicitacao.descricao or "")[:255],
            "oficio": None,
            "recurrency": None,
            "status": "APPROVED",
            "google_event_id": None,
        }

        nova = self.repository.create(db, data)
        try:
            eid = self._sync_google_create(db, nova, admin_user, room)
            self.repository.update(db, nova, {"google_event_id": eid})
        except Exception:
            self.repository.delete(db, nova.id)
            raise
        return nova.id

    def create_reservation(self, db: Session, payload: ReservationCreate, current_user) -> dict:
        if payload.dia_horario_saida <= payload.dia_horario_inicio:
            raise HTTPException(status_code=400, detail="A data de saída deve ser posterior à data de início.")

        room = db.query(Sala).filter(Sala.id == payload.fk_sala).first()
        if not room:
            raise HTTPException(status_code=404, detail="Sala não encontrada.")

        from app.services.auth.rbac import ROLE_ADMIN
        if current_user.tipo_usuario < ROLE_ADMIN:
            payload.status = "PENDING"
        elif not payload.status:
            payload.status = "APPROVED"

        try:
            data = payload.model_dump()
            
            # Ajusta `dia_horario_saida` e preenche `recurrency` caso o frontend
            # mande um intervalo de meses para um evento com `dia_semana`.
            start_dt_local = data.get("dia_horario_inicio")
            end_dt_local = data.get("dia_horario_saida")
            dia_semana = data.get("dia_semana")
            recurrency = data.get("recurrency")
            
            if dia_semana and not recurrency and start_dt_local and end_dt_local:
                duration = end_dt_local - start_dt_local
                if duration.total_seconds() > 86400: # > 1 dia
                    h_end, m_end = end_dt_local.hour, end_dt_local.minute
                    adjusted_end = start_dt_local.replace(hour=h_end, minute=m_end)
                    if adjusted_end <= start_dt_local:
                        adjusted_end += timedelta(days=1)
                    
                    until_dt = ensure_utc(end_dt_local).replace(hour=23, minute=59, second=59)
                    until_str = until_dt.strftime("%Y%m%dT%H%M%SZ")
                    weekday_code = _WEEKDAY_TO_RRULE.get(dia_semana)
                    
                    if weekday_code:
                        data["dia_horario_saida"] = adjusted_end
                        data["recurrency"] = f"RRULE:FREQ=WEEKLY;BYDAY={weekday_code};UNTIL={until_str}"
                        data["data_inicio"] = to_storage_datetime(start_dt_local.replace(hour=0, minute=0, second=0, microsecond=0))
                        data["data_fim"] = to_storage_datetime(end_dt_local.replace(hour=23, minute=59, second=59, microsecond=0))
            
            nova = self.repository.create(db, data)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Falha ao salvar no Banco Local: {e}")

        if nova.status == "APPROVED":
            try:
                eid = self._sync_google_create(db, nova, current_user, room)
                self.repository.update(db, nova, {"google_event_id": eid})
            except Exception:
                self.repository.delete(db, nova.id)
                raise

        db.refresh(nova)
        return build_local_event(nova, nova.dia_horario_inicio, nova.dia_horario_saida)

    def _sync_google_create(self, db: Session, alocacao: Alocacao, current_user, room: Sala) -> str:
        self._require_google_credentials(db, current_user.id)
        start_dt = ensure_utc(from_storage_datetime(alocacao.dia_horario_inicio))
        end_dt = ensure_utc(from_storage_datetime(alocacao.dia_horario_saida))
        
        recurrency = alocacao.recurrency
        
        if alocacao.dia_semana and not recurrency:
            weekday_code = _WEEKDAY_TO_RRULE.get(alocacao.dia_semana)
            if weekday_code:
                target_wd = _DIA_SEMANA_PARA_WEEKDAY.get(alocacao.dia_semana)
                days_diff = (target_wd - start_dt.weekday() + 7) % 7
                if days_diff > 0:
                    start_dt += timedelta(days=days_diff)
                
                duration = end_dt - start_dt

                if duration.total_seconds() > 86400: # > 1 dia
                    h_end, m_end = end_dt.hour, end_dt.minute
                    end_dt = start_dt.replace(hour=h_end, minute=m_end)
                    if end_dt <= start_dt:
                        end_dt += timedelta(days=1)
                else:
                    pass
                
                until_dt = ensure_utc(from_storage_datetime(alocacao.data_fim)).replace(hour=23, minute=59, second=59)
                until_str = until_dt.strftime("%Y%m%dT%H%M%SZ")
                recurrency = f"RRULE:FREQ=WEEKLY;BYDAY={weekday_code};UNTIL={until_str}"

        if self._conflicts_google(db, current_user.id, alocacao.fk_sala, start_dt, end_dt):
            raise HTTPException(status_code=409, detail="Conflito detectado no Google Calendar.")

        room_label = room.codigo_sala or str(room.id)
        extended_props = build_event_private_metadata(alocacao, status_override="APPROVED")

        applicant = db.query(Usuario).filter(Usuario.id == alocacao.fk_usuario).first()
        attendees = [applicant.email] if applicant and applicant.email else []

        professor = None
        if alocacao.fk_professor:
            professor = db.query(Usuario).filter(Usuario.id == alocacao.fk_professor).first()
            if professor and professor.email and professor.email not in attendees:
                attendees.append(professor.email)

        created = google_calendar.create_event(
            db=db,
            user_id=current_user.id,
            summary=build_event_summary(alocacao.tipo, alocacao.uso, room_label),
            description=build_event_description(
                alocacao.justificativa,
                room=room,
                applicant=applicant,
                professor=professor,
                reservation=alocacao,
            ),
            start_dt_utc=start_dt,
            end_dt_utc=end_dt,
            location=room.descricao_sala,
            extended_private=extended_props,
            recurrence_rule=recurrency,
            attendees=attendees,
        )
        if not created or not created.get("id"):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Falha ao criar evento no Google Calendar. Verifique se sua conexão Google ainda é válida "
                    "em Admin → Calendário."
                ),
            )
        return str(created["id"])

    def _sync_google_delete_if_exists(self, db: Session, alocacao: Alocacao, current_user) -> None:
        """
        Remove o evento no Google quando existir vínculo local.
        """
        if not alocacao.google_event_id:
            return
        try:
            self._require_google_credentials(db, current_user.id)
            ok = google_calendar.delete_event(db=db, user_id=current_user.id, event_id=alocacao.google_event_id)
            if not ok:
                import logging
                logging.warning(f"Aviso: Não foi possível remover o evento {alocacao.google_event_id} no Google Calendar. Continuando com a exclusão local.")
        except Exception as e:
            import logging
            logging.warning(f"Exceção ignorada ao tentar remover evento do Google Calendar: {e}")

    def approve_reservation(self, db: Session, reservation_id: int, current_user) -> dict:
        alocacao = self.repository.get_by_id(db, reservation_id)
        if not alocacao:
            raise HTTPException(status_code=404, detail="Reserva não encontrada.")
        if alocacao.status == "APPROVED" and alocacao.google_event_id:
            return {"message": "Reserva já está aprovada."}

        room = db.query(Sala).filter(Sala.id == alocacao.fk_sala).first()
        eid = self._sync_google_create(db, alocacao, current_user, room)
        self.repository.update(db, alocacao, {"google_event_id": eid, "status": "APPROVED"})
        return {"message": "Reserva aprovada e sincronizada."}

    def reject_reservation(self, db: Session, reservation_id: int, current_user=None) -> dict:
        alocacao = self.repository.get_by_id(db, reservation_id)
        if not alocacao:
            raise HTTPException(status_code=404, detail="Reserva não encontrada.")
        if current_user and alocacao.google_event_id:
            self._sync_google_delete_if_exists(db, alocacao, current_user)
            self.repository.update(db, alocacao, {"google_event_id": None})
        self.repository.update_status(db, alocacao, "REJECTED")
        return {"message": "Reserva rejeitada."}

    def _sync_google_update(self, db: Session, alocacao: Alocacao, current_user, room: Sala) -> None:
        if not alocacao.google_event_id:
            return
        self._require_google_credentials(db, current_user.id)
        start_dt = ensure_utc(from_storage_datetime(alocacao.dia_horario_inicio))
        end_dt = ensure_utc(from_storage_datetime(alocacao.dia_horario_saida))
        room_label = room.codigo_sala or str(room.id)

        applicant = db.query(Usuario).filter(Usuario.id == alocacao.fk_usuario).first()
        professor = None
        if alocacao.fk_professor:
            professor = db.query(Usuario).filter(Usuario.id == alocacao.fk_professor).first()

        patch: dict = {
            "summary": build_event_summary(alocacao.tipo, alocacao.uso, room_label),
            "description": build_event_description(
                alocacao.justificativa,
                room=room,
                applicant=applicant,
                professor=professor,
                reservation=alocacao,
            ),
            "start": {"dateTime": start_dt.isoformat(), "timeZone": "UTC"},
            "end": {"dateTime": end_dt.isoformat(), "timeZone": "UTC"},
            "extendedProperties": {"private": build_event_private_metadata(alocacao)},
        }
        
        attendees = [applicant.email] if applicant and applicant.email else []
        if professor and professor.email and professor.email not in attendees:
            attendees.append(professor.email)

        patch["attendees"] = [{"email": email} for email in attendees]

        if room.descricao_sala:
            patch["location"] = room.descricao_sala
        updated = google_calendar.update_event(
            db=db, user_id=current_user.id, event_id=alocacao.google_event_id, patch=patch
        )
        if updated is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Falha ao atualizar evento no Google Calendar.",
            )

    def delete_reservation(self, db: Session, reservation_id: str, delete_series: bool, current_user) -> None:
        parts = reservation_id.split(":")
        base_id_str = parts[0]
        if not base_id_str.isdigit():
            return
        lid = int(base_id_str)
        alocacao = self.repository.get_by_id(db, lid)
        if not alocacao:
            return

        if not delete_series and len(parts) > 1 and alocacao.recurrency:
            date_str = parts[1]  # e.g. '2026-05-15T08:00:00' or '2026-05-15T08:00:00-03:00'
            
            # Parse properly to avoid timezone messes breaking EXDATE format YYYYMMDDTHHMMSS
            from dateutil.parser import isoparse
            try:
                dt_obj = isoparse(date_str)
                dt_formatted_local = dt_obj.strftime("%Y%m%dT%H%M%S")
            except Exception:
                dt_formatted_local = date_str[:19].replace("-", "").replace(":", "")
                
            if "EXDATE" not in alocacao.recurrency:
                alocacao.recurrency += f"\nEXDATE:{dt_formatted_local}"
            else:
                alocacao.recurrency += f",{dt_formatted_local}"
            
            self.repository.update(db, alocacao, {"recurrency": alocacao.recurrency})

            # Delete single instance in Google Calendar
            if alocacao.status == "APPROVED" and alocacao.google_event_id:
                try:
                    from app.services.infra.datetime_utils import ensure_app_timezone, ensure_utc
                    from datetime import datetime
                    
                    local_dt = ensure_app_timezone(isoparse(date_str))
                    utc_dt = ensure_utc(local_dt)
                    utc_formatted = utc_dt.strftime("%Y%m%dT%H%M%SZ")
                    instance_google_id = f"{alocacao.google_event_id}_{utc_formatted}"
                    
                    # Usa o credencial do dono da alocação ou de quem já tenha credencial
                    creds_row = db.query(GoogleCredential).first()
                    if creds_row:
                        google_calendar.delete_event(db=db, user_id=creds_row.user_id, event_id=instance_google_id)
                except Exception as e:
                    print(f"Failed to delete single instance in Google Calendar: {e}")
            return

        if alocacao.status == "APPROVED" and alocacao.google_event_id:
            try:
                creds_row = db.query(GoogleCredential).first()
                if creds_row:
                    google_calendar.delete_event(db=db, user_id=creds_row.user_id, event_id=alocacao.google_event_id)
            except Exception as e:
                print(f"Erro ao deletar evento no Google: {e}")

        # Quando a alocação derivou de uma solicitação aprovada, rejeita a solicitação
        # para que ela reflita o estado real na lista de solicitações.
        linked_solicitation = db.query(Solicitacao).filter(Solicitacao.fk_alocacao == lid).first()
        if linked_solicitation:
            linked_solicitation.status = "recusado"
            db.commit()

        self.repository.delete(db, lid)

    def update_reservation(
        self,
        db: Session,
        reservation_id: str,
        payload: ReservationUpdate,
        current_user,
    ) -> dict:
        base_id_str = reservation_id.split(":")[0]
        if not base_id_str.isdigit():
            raise HTTPException(status_code=400, detail="ID de reserva inválido")
        lid = int(base_id_str)
        alocacao = self.repository.get_by_id(db, lid)
        if not alocacao:
            raise HTTPException(status_code=404, detail="Reserva não encontrada")

        from app.services.auth.rbac import ROLE_ADMIN
        is_admin = int(current_user.tipo_usuario or 0) >= ROLE_ADMIN
        if not is_admin and alocacao.fk_usuario != current_user.id:
            raise HTTPException(status_code=403, detail="Sem permissão para editar esta reserva")

        update_data = payload.model_dump(exclude_unset=True)
        if "fk_usuario" in update_data and not is_admin:
            update_data.pop("fk_usuario", None)
        if not update_data:
            raise HTTPException(status_code=400, detail="Nenhum dado para atualizar")

        start_dt_local = update_data.get("dia_horario_inicio", alocacao.dia_horario_inicio)
        end_dt_local = update_data.get("dia_horario_saida", alocacao.dia_horario_saida)

        if start_dt_local and end_dt_local and end_dt_local <= start_dt_local:
            raise HTTPException(status_code=400, detail="A data de saída deve ser posterior à data de início.")

        if "dia_horario_inicio" in update_data or "dia_horario_saida" in update_data or "dia_semana" in update_data:
            dia_semana = update_data.get("dia_semana", alocacao.dia_semana)
            recurrency = update_data.get("recurrency", alocacao.recurrency)
            
            if dia_semana and not recurrency and start_dt_local and end_dt_local:
                duration = end_dt_local - start_dt_local
                if duration.total_seconds() > 86400: # > 1 dia
                    h_end, m_end = end_dt_local.hour, end_dt_local.minute
                    adjusted_end = start_dt_local.replace(hour=h_end, minute=m_end)
                    if adjusted_end <= start_dt_local:
                        adjusted_end += timedelta(days=1)
                    
                    until_dt = ensure_utc(end_dt_local).replace(hour=23, minute=59, second=59)
                    until_str = until_dt.strftime("%Y%m%dT%H%M%SZ")
                    weekday_code = _WEEKDAY_TO_RRULE.get(dia_semana)
                    
                    if weekday_code:
                        update_data["dia_horario_saida"] = adjusted_end
                        update_data["recurrency"] = f"RRULE:FREQ=WEEKLY;BYDAY={weekday_code};UNTIL={until_str}"
                        update_data["data_inicio"] = to_storage_datetime(start_dt_local.replace(hour=0, minute=0, second=0, microsecond=0))
                        update_data["data_fim"] = to_storage_datetime(end_dt_local.replace(hour=23, minute=59, second=59, microsecond=0))

        prev_status = (alocacao.status or "").upper()
        updated = self.repository.update(db, alocacao, update_data)
        room = db.query(Sala).filter(Sala.id == updated.fk_sala).first()
        updated_status = (updated.status or "").upper()
        if room and updated_status == "APPROVED":
            if updated.google_event_id:
                self._sync_google_update(db, updated, current_user, room)
            else:
                try:
                    eid = self._sync_google_create(db, updated, current_user, room)
                    self.repository.update(db, updated, {"google_event_id": eid})
                except Exception:
                    if prev_status != "APPROVED":
                        self.repository.update(db, updated, {"status": alocacao.status})
                    raise
        elif updated.google_event_id and updated_status != "APPROVED":
            self._sync_google_delete_if_exists(db, updated, current_user)
            updated = self.repository.update(db, updated, {"google_event_id": None})

        start_dt = from_storage_datetime(updated.dia_horario_inicio)
        end_dt = from_storage_datetime(updated.dia_horario_saida)
        return build_local_event(updated, start_dt, end_dt)


allocation_service = AllocationService()
