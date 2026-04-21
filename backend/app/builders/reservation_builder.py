"""
Builder de eventos de reserva — funções puras sem efeitos colaterais.

Responsabilidades:
- Converter um modelo `Alocacao` para o formato de evento usado pela API/frontend.
- Expandir instâncias de eventos recorrentes dentro de um intervalo de datas.
"""

from typing import Optional
from datetime import datetime
from dateutil.rrule import rrulestr

from app.models import Alocacao
from app.services.datetime_utils import APP_TIMEZONE_NAME, from_storage_datetime

PLATFORM_EVENT_SOURCE = "alocacoes"


def build_local_event(
    reservation: Alocacao,
    start_dt: datetime,
    end_dt: datetime,
    instance_id: Optional[str] = None,
) -> dict:
    """
    Constrói um dicionário de evento no formato compatível com Google Calendar
    a partir de um modelo local `Alocacao`.

    Args:
        reservation: modelo de alocação do banco
        start_dt: data/hora de início (já convertida para o fuso local)
        end_dt: data/hora de término
        instance_id: para eventos recorrentes, ID da instância específica (ex: "3:2026-03-19T08:00:00")
    """
    event_dict = {
        "id": instance_id or str(reservation.id),
        "summary": reservation.uso or "Reservado",
        "description": reservation.justificativa or "",
        "recurrence": [reservation.recurrency] if reservation.recurrency and instance_id is None else None,
        "start": {
            "dateTime": start_dt.isoformat(),
            "timeZone": APP_TIMEZONE_NAME,
        },
        "end": {
            "dateTime": end_dt.isoformat(),
            "timeZone": APP_TIMEZONE_NAME,
        },
        "extendedProperties": {
            "private": {
                "fk_sala": str(reservation.fk_sala),
                "fk_usuario": str(reservation.fk_usuario),
                "solicitante_nome": reservation.usuario.nome if reservation.usuario else "Desconhecido",
                "professor_nome": reservation.professor.nome if reservation.professor else "Nenhum",
                "fk_curso": str(reservation.fk_curso or ""),
                "fk_periodo": str(reservation.fk_periodo or ""),
                "dia_semana": str(reservation.dia_semana or ""),
                "tipo": str(reservation.tipo or ""),
                "uso": str(reservation.uso or ""),
                "oficio": str(reservation.oficio or ""),
                "data_inicio": reservation.data_inicio.isoformat() if reservation.data_inicio else "",
                "data_fim": reservation.data_fim.isoformat() if reservation.data_fim else "",
                "platform_source": PLATFORM_EVENT_SOURCE,
                "local_reservation_id": str(reservation.id),
            }
        },
        "status": reservation.status or "PENDING",
    }

    if instance_id is not None:
        event_dict["recurringEventId"] = str(reservation.id)

    return event_dict


def expand_local_reservation(
    reservation: Alocacao,
    range_start: datetime,
    range_end: datetime,
) -> list[dict]:
    """
    Retorna lista de eventos para uma reserva, expandindo recorrências no intervalo.
    Para reservas simples retorna lista com 1 elemento (ou vazia se fora do range).
    """
    start_dt = from_storage_datetime(reservation.dia_horario_inicio)
    end_dt = from_storage_datetime(reservation.dia_horario_saida)

    if not reservation.recurrency:
        if end_dt < range_start or start_dt > range_end:
            return []
        return [build_local_event(reservation, start_dt, end_dt)]

    try:
        recurrence = rrulestr(reservation.recurrency, dtstart=start_dt)
    except Exception as exc:
        print(f"Erro ao expandir recorrência local {reservation.id}: {exc}")
        if end_dt < range_start or start_dt > range_end:
            return []
        return [build_local_event(reservation, start_dt, end_dt)]

    duration = end_dt - start_dt
    events = []
    for occurrence_start in recurrence.between(range_start, range_end, inc=True):
        occurrence_end = occurrence_start + duration
        instance_id = f"{reservation.id}:{occurrence_start.isoformat()}"
        events.append(build_local_event(reservation, occurrence_start, occurrence_end, instance_id))

    return events
