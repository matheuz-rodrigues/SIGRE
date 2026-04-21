"""
Service Layer de Alocações — Padronizado com Design Patterns.
Orquestra Repositório, Regras de Negócio e Google Calendar (paridade 1:1 com eventos aprovados).
"""

from typing import Optional, List, Any
from datetime import datetime, date, time, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from app.models import Alocacao, Sala, Usuario
from app.models.solicitation import Solicitacao
from app.repositories.allocation_repository import allocation_repository
from app.builders.reservation_builder import build_local_event, expand_local_reservation, PLATFORM_EVENT_SOURCE
from app.services import google_calendar
from app.services.datetime_utils import ensure_utc, ensure_app_timezone, from_storage_datetime, to_storage_datetime, APP_TIMEZONE_NAME
from app.schemas.reservation import ReservationCreate, ReservationUpdate
from app.services.base_service import BaseService
from app.services.rbac import ROLE_ADMIN

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
        items = google_calendar.list_events(db=db, user_id=user_id, time_min_utc=start_dt, time_max_utc=end_dt)
        if items is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não foi possível consultar o Google Calendar para checagem de conflitos.",
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

        from app.services.rbac import ROLE_ADMIN
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

        from app.services.rbac import ROLE_ADMIN
        is_admin = current_user.tipo_usuario >= ROLE_ADMIN
        has_google = google_calendar._get_credentials(db, current_user.id) is not None

        if is_admin:
            if not has_google:
                payload.status = "PENDING"
            elif not payload.status:
                payload.status = "APPROVED"
        else:
            payload.status = "PENDING"

        try:
            data = payload.model_dump()
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
        result = build_local_event(nova, nova.dia_horario_inicio, nova.dia_horario_saida)
        if is_admin and not has_google:
            result["google_required_for_approval"] = True
        return result

    def _sync_google_create(self, db: Session, alocacao: Alocacao, current_user, room: Sala) -> str:
        self._require_google_credentials(db, current_user.id)
        start_dt = ensure_utc(from_storage_datetime(alocacao.dia_horario_inicio))
        end_dt = ensure_utc(from_storage_datetime(alocacao.dia_horario_saida))

        if self._conflicts_google(db, current_user.id, alocacao.fk_sala, start_dt, end_dt):
            raise HTTPException(status_code=409, detail="Conflito detectado no Google Calendar.")

        extended_props = {
            "fk_sala": str(alocacao.fk_sala),
            "fk_usuario": str(alocacao.fk_usuario),
            "fk_professor": str(alocacao.fk_professor or ""),
            "fk_disciplina": str(alocacao.fk_disciplina or ""),
            "fk_curso": str(alocacao.fk_curso or ""),
            "fk_periodo": str(alocacao.fk_periodo or ""),
            "tipo": alocacao.tipo,
            "uso": alocacao.uso or "",
            "platform_source": PLATFORM_EVENT_SOURCE,
            "local_reservation_id": str(alocacao.id),
            "status": "APPROVED",
        }
        if alocacao.recurrency:
            extended_props["recurrency"] = alocacao.recurrency

        applicant = db.query(Usuario).filter(Usuario.id == alocacao.fk_usuario).first()
        attendees = [applicant.email] if applicant and applicant.email else []

        created = google_calendar.create_event(
            db=db,
            user_id=current_user.id,
            summary=f"([Aula] {alocacao.uso or 'Reserva'} na {room.codigo_sala or room.id})",
            description=(alocacao.justificativa or "").split("| META:")[0].strip(),
            start_dt_utc=start_dt,
            end_dt_utc=end_dt,
            location=room.descricao_sala,
            extended_private=extended_props,
            recurrence_rule=alocacao.recurrency,
            attendees=attendees,
        )
        if not created or not created.get("id"):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Falha ao criar evento no Google Calendar (resposta sem id).",
            )
        return str(created["id"])

    def _sync_google_delete(self, db: Session, alocacao: Alocacao, current_user):
        """
        Busca o evento no Google Calendar pelo ID local e o remove.
        """
        start_dt = ensure_utc(alocacao.dia_horario_inicio)
        end_dt = ensure_utc(alocacao.dia_horario_saida)
        
        events = list_events(db, current_user.id, start_dt, end_dt)
        if not events:
            return

        for ev in events:
            priv = (ev.get("extendedProperties") or {}).get("private") or {}
            if str(priv.get("local_reservation_id")) == str(alocacao.id):
                delete_event(db, current_user.id, ev["id"])
                print(f"DEBUG: Evento Google {ev['id']} removido para alocação {alocacao.id}")

    def approve_reservation(self, db: Session, reservation_id: any, current_user) -> dict:
        # Suporte para IDs de instância (ex: "5:2025-05-10T08:00:00")
        if isinstance(reservation_id, str) and ":" in reservation_id:
            return self._handle_instance_action(db, reservation_id, "APPROVE", current_user)
            
        lid = int(reservation_id)
        alocacao = self.repository.get_by_id(db, lid)
        if not alocacao:
            raise HTTPException(status_code=404, detail="Reserva não encontrada.")
        if alocacao.status == "APPROVED":
            return {"message": "Reserva já está aprovada."}

        room = db.query(Sala).filter(Sala.id == alocacao.fk_sala).first()
        eid = self._sync_google_create(db, alocacao, current_user, room)
        self.repository.update(db, alocacao, {"google_event_id": eid, "status": "APPROVED"})
        return {"message": "Reserva aprovada e sincronizada."}

    def reject_reservation(self, db: Session, reservation_id: any, current_user) -> dict:
        if isinstance(reservation_id, str) and ":" in reservation_id:
            return self._handle_instance_action(db, reservation_id, "REJECT", current_user)

        lid = int(reservation_id)
        alocacao = self.repository.get_by_id(db, lid)
        if not alocacao:
            raise HTTPException(status_code=404, detail="Reserva não encontrada.")
            
        if alocacao.status == "APPROVED" and alocacao.google_event_id:
            google_calendar.delete_event(
                db=db, user_id=current_user.id, event_id=alocacao.google_event_id
            )
            
        self.repository.update(db, alocacao, {"status": "REJECTED", "google_event_id": None})
        return {"message": "Reserva rejeitada."}

    def _handle_instance_action(self, db: Session, instance_id: str, action: str, current_user) -> dict:
        """
        Lógica para 'desmembrar' uma data específica de uma série recorrente.
        """
        parts = instance_id.split(":")
        base_id = int(parts[0])
        instance_time = parts[1] # ISO Format
        
        parent = self.repository.get_by_id(db, base_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Reserva base não encontrada.")
            
        dt_target = datetime.fromisoformat(instance_time)
        
        # 1. Remover data da série original (adicionando EXDATE)
        self._exclude_date_from_parent(db, parent, dt_target)
        
        if action == "APPROVE":
            # 2. Criar nova reserva isolada e aprovada
            new_data = {
                "fk_usuario": parent.fk_usuario,
                "fk_sala": parent.fk_sala,
                "fk_professor": parent.fk_professor,
                "fk_disciplina": parent.fk_disciplina,
                "fk_curso": parent.fk_curso,
                "fk_periodo": parent.fk_periodo,
                "tipo": parent.tipo,
                "uso": parent.uso,
                "justificativa": parent.justificativa,
                "dia_semana": parent.dia_semana,
                "dia_horario_inicio": dt_target,
                # A duração é mantida
                "dia_horario_saida": dt_target + (parent.dia_horario_saida - parent.dia_horario_inicio),
                "data_inicio": dt_target,
                "data_fim": dt_target,
                "status": "PENDING", # Será aprovado logo abaixo
            }
            # Salvamos e aprovamos
            new_aloc = self.repository.create(db, new_data)
            return self.approve_reservation(db, new_aloc.id, current_user)
            
        return {"message": "Data removida da série com sucesso."}

    def _exclude_date_from_parent(self, db: Session, parent: Alocacao, dt: datetime):
        """Atualiza a string de recorrência para incluir um EXDATE em UTC."""
        from app.services.datetime_utils import ensure_app_timezone
        dt_local = ensure_app_timezone(dt)
        exdate_str = dt_local.strftime("%Y%m%dT%H%M%S")
        
        current_rec = parent.recurrency or ""
        if not current_rec.startswith("RRULE:"):
             current_rec = f"RRULE:{current_rec}"
             
        # Adiciona EXDATE com terminologia nativa ingênua que fecha perfeito com o parser de exclusão
        new_rec = f"{current_rec}\nEXDATE:{exdate_str}"
        self.repository.update(db, parent, {"recurrency": new_rec})

    def _sync_google_update(self, db: Session, alocacao: Alocacao, current_user, room: Sala) -> None:
        if not alocacao.google_event_id:
            return
        self._require_google_credentials(db, current_user.id)
        start_dt = ensure_utc(from_storage_datetime(alocacao.dia_horario_inicio))
        end_dt = ensure_utc(from_storage_datetime(alocacao.dia_horario_saida))
        patch: dict = {
            "summary": f"([Aula] {alocacao.uso or 'Reserva'} na {room.codigo_sala or room.id})",
            "description": (alocacao.justificativa or "").split("| META:")[0].strip(),
            "start": {"dateTime": start_dt.isoformat(), "timeZone": "UTC"},
            "end": {"dateTime": end_dt.isoformat(), "timeZone": "UTC"},
        }
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
        base_id_str = reservation_id.split(":")[0]
        if not base_id_str.isdigit():
            return
        lid = int(base_id_str)
        alocacao = self.repository.get_by_id(db, lid)
        if not alocacao:
            return
        if alocacao.status == "APPROVED" and alocacao.google_event_id:
            self._require_google_credentials(db, current_user.id)
            ok = google_calendar.delete_event(
                db=db, user_id=current_user.id, event_id=alocacao.google_event_id
            )
            if not ok:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Não foi possível remover o evento correspondente no Google Calendar.",
                )
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

        from app.services.rbac import ROLE_ADMIN
        is_admin = int(current_user.tipo_usuario or 0) >= ROLE_ADMIN
        if not is_admin and alocacao.fk_usuario != current_user.id:
            raise HTTPException(status_code=403, detail="Sem permissão para editar esta reserva")

        update_data = payload.model_dump(exclude_unset=True)
        if "fk_usuario" in update_data and not is_admin:
            update_data.pop("fk_usuario", None)
        if not update_data:
            raise HTTPException(status_code=400, detail="Nenhum dado para atualizar")

        if "dia_horario_inicio" in update_data and "dia_horario_saida" in update_data:
            if update_data["dia_horario_saida"] <= update_data["dia_horario_inicio"]:
                raise HTTPException(status_code=400, detail="A data de saída deve ser posterior à data de início.")

        prev_status = (alocacao.status or "").upper()
        updated = self.repository.update(db, alocacao, update_data)
        room = db.query(Sala).filter(Sala.id == updated.fk_sala).first()
        if room and (updated.status or "").upper() == "APPROVED":
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

        start_dt = from_storage_datetime(updated.dia_horario_inicio)
        end_dt = from_storage_datetime(updated.dia_horario_saida)
        return build_local_event(updated, start_dt, end_dt)


allocation_service = AllocationService()
