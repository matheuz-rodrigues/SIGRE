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

    recurrency_str = reservation.recurrency
    
    from app.services.datetime_utils import APP_TIMEZONE, ensure_app_timezone
    
    # 1. Garante que range e dtstart originais estão corretos
    start_dt = ensure_app_timezone(start_dt)
    end_dt = ensure_app_timezone(end_dt)
    range_start = ensure_app_timezone(range_start)
    range_end = ensure_app_timezone(range_end)

    # 2. Transforma tudo em NAIVE para o python-dateutil não engasgar
    start_dt_naive = start_dt.replace(tzinfo=None)
    range_start_naive = range_start.replace(tzinfo=None)
    range_end_naive = range_end.replace(tzinfo=None)

    # 3. Limpa TZID ou marcações "Z" antigas para forçar o dateutil a ler as exclusões como naive também
    import re
    safe_recurrency_str = re.sub(r';TZID=[^:]+:', ':', recurrency_str)
    safe_recurrency_str = safe_recurrency_str.replace('Z\n', '\n')
    if safe_recurrency_str.endswith('Z'):
        safe_recurrency_str = safe_recurrency_str[:-1]

    try:
        recurrence = rrulestr(safe_recurrency_str, dtstart=start_dt_naive)
    except Exception as exc:
        print(f"Erro ao expandir recorrência local {reservation.id}: {exc}")
        if end_dt < range_start or start_dt > range_end:
            return []
        return [build_local_event(reservation, start_dt, end_dt)]

    duration = end_dt - start_dt
    events = []
    try:
        # A iteração agora é estritamente naive (sem fuso), evitando "can't compare offset-naive and offset-aware"
        for occurrence_start_naive in recurrence.between(range_start_naive, range_end_naive, inc=True):
            # 4. Devolve o fuso horário para a ocorrência validada
            occurrence_start = occurrence_start_naive.replace(tzinfo=APP_TIMEZONE)
            occurrence_end = occurrence_start + duration
            instance_id = f"{reservation.id}:{occurrence_start.isoformat()}"
            events.append(build_local_event(reservation, occurrence_start, occurrence_end, instance_id))
    except Exception as exc:
        print(f"Erro na iteração da recorrência {reservation.id}: {exc}")
        if not (end_dt < range_start or start_dt > range_end):
             events.append(build_local_event(reservation, start_dt, end_dt))

    return events
