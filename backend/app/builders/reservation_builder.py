"""
Builder de eventos de reserva — funções puras sem efeitos colaterais.

Responsabilidades:
- Converter um modelo `Alocacao` para o formato de evento usado pela API/frontend.
- Expandir instâncias de eventos recorrentes dentro de um intervalo de datas.
"""

import re
from typing import Optional
from datetime import datetime, timezone
from dateutil.rrule import rrulestr

from app.models import Alocacao
from app.models.room import Sala
from app.models.user import Usuario
from app.services.infra.datetime_utils import APP_TIMEZONE, APP_TIMEZONE_NAME, from_storage_datetime, ensure_app_timezone

PLATFORM_EVENT_SOURCE = "alocacoes"


def build_event_summary(tipo: Optional[str], uso: Optional[str], room_label: Optional[str] = None) -> str:
    """
    Gera um título consistente para UI e Google Calendar.
    """
    event_type = (tipo or "RESERVA").strip().upper()
    uso_clean = (uso or "").strip()

    if uso_clean and room_label:
        return f"[{event_type}] {uso_clean} – {room_label}"
    elif uso_clean:
        return f"[{event_type}] {uso_clean}"
    elif room_label:
        return f"[{event_type}] {room_label}"
    else:
        return f"[{event_type}] Reserva"


def build_event_description(
    justificativa: Optional[str],
    *,
    room: Optional[Sala] = None,
    applicant: Optional[Usuario] = None,
    professor: Optional[Usuario] = None,
    reservation: Optional[Alocacao] = None,
) -> str:
    """
    Gera a descrição do evento com todas as informações relevantes para o usuário.
    """
    lines: list[str] = []

    if room is not None:
        sala_label = (getattr(room, "codigo_sala", "") or "").strip() or str(getattr(room, "id", ""))
        sala_desc = (getattr(room, "descricao_sala", "") or "").strip()
        if sala_desc and sala_desc != sala_label:
            lines.append(f"Sala: {sala_label} – {sala_desc}")
        else:
            lines.append(f"Sala: {sala_label}")

    if applicant is not None:
        nome = (getattr(applicant, "nome", "") or "").strip()
        email = (getattr(applicant, "email", "") or "").strip()
        if nome and email:
            lines.append(f"Solicitante: {nome} ({email})")
        elif nome:
            lines.append(f"Solicitante: {nome}")
        elif email:
            lines.append(f"Solicitante: {email}")

    if professor is not None:
        nome = (getattr(professor, "nome", "") or "").strip()
        email = (getattr(professor, "email", "") or "").strip()
        if nome and email:
            lines.append(f"Professor: {nome} ({email})")
        elif nome:
            lines.append(f"Professor: {nome}")
        elif email:
            lines.append(f"Professor: {email}")

    if reservation is not None:
        if reservation.dia_semana and reservation.dia_semana.strip():
            lines.append(f"Dia: {reservation.dia_semana.strip()}")
        uso_clean = (reservation.uso or "").strip()
        if uso_clean:
            lines.append(f"Uso: {uso_clean}")

    justificativa_clean = (justificativa or "").strip()
    if justificativa_clean:
        if lines:
            lines.append("")
            lines.append("Justificativa:")
        lines.append(justificativa_clean)

    if reservation is not None:
        oficio_clean = (reservation.oficio or "").strip()
        if oficio_clean:
            if lines:
                lines.append("")
            lines.append(f"Ofício: {oficio_clean}")

    return "\n".join(lines)


def build_event_private_metadata(reservation: Alocacao, status_override: Optional[str] = None) -> dict[str, str]:
    """
    Centraliza metadados usados para reconciliação entre SIGRA e Google.
    """
    metadata = {
        "fk_sala": str(reservation.fk_sala),
        "fk_usuario": str(reservation.fk_usuario),
        "tipo": str(reservation.tipo or ""),
        "uso": str(reservation.uso or ""),
        "oficio": str(reservation.oficio or ""),
        "platform_source": PLATFORM_EVENT_SOURCE,
        "local_reservation_id": str(reservation.id),
        "status": str((status_override or reservation.status or "PENDING")).upper(),
    }

    optional_values = {
        "fk_professor": reservation.fk_professor,
        "fk_disciplina": reservation.fk_disciplina,
        "fk_curso": reservation.fk_curso,
        "fk_periodo": reservation.fk_periodo,
        "dia_semana": reservation.dia_semana,
        "recurrency": reservation.recurrency,
    }
    for key, value in optional_values.items():
        if value is not None and str(value).strip() != "":
            metadata[key] = str(value)

    return metadata


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
        "summary": build_event_summary(reservation.tipo, reservation.uso),
        "description": build_event_description(reservation.justificativa),
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
            "private": build_event_private_metadata(reservation)
        },
        "status": reservation.status or "PENDING",
    }

    if instance_id is not None:
        event_dict["recurringEventId"] = str(reservation.id)

    return event_dict


_UNTIL_UTC = re.compile(r"UNTIL=(\d{8}T\d{6})Z")


def _until_as_local_naive(rule: str) -> str:
    """UNTIL em UTC (formato gerado pelo front e pelo Google) -> horário local sem fuso.

    A expansão usa dtstart sem fuso, e o dateutil recusa misturar dtstart sem fuso com UNTIL em UTC.
    """
    def convert(match: re.Match) -> str:
        utc = datetime.strptime(match.group(1), "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
        return "UNTIL=" + utc.astimezone(APP_TIMEZONE).strftime("%Y%m%dT%H%M%S")
    return _UNTIL_UTC.sub(convert, rule)


def _expand(
    start_dt: datetime,
    end_dt: datetime,
    recurrency: Optional[str],
    range_start: datetime,
    range_end: datetime,
) -> tuple[list[tuple[datetime, datetime]], bool]:
    """Ocorrências (início, fim) no fuso da aplicação e se a recorrência foi de fato expandida."""
    start_dt = ensure_app_timezone(start_dt)
    end_dt = ensure_app_timezone(end_dt)
    range_start_app = ensure_app_timezone(range_start)
    range_end_app = ensure_app_timezone(range_end)

    def single() -> list[tuple[datetime, datetime]]:
        if end_dt < range_start_app or start_dt > range_end_app:
            return []
        return [(start_dt, end_dt)]

    if not recurrency:
        return single(), False

    try:
        recurrence = rrulestr(_until_as_local_naive(recurrency), dtstart=start_dt.replace(tzinfo=None))
    except Exception as exc:
        print(f"Erro ao expandir recorrência local: {exc}")
        return single(), False

    duration = end_dt - start_dt
    occurrences = []
    for occ_naive in recurrence.between(
        range_start_app.replace(tzinfo=None), range_end_app.replace(tzinfo=None), inc=True
    ):
        occurrence_start = ensure_app_timezone(occ_naive)
        occurrences.append((occurrence_start, occurrence_start + duration))
    return occurrences, True


def expand_occurrences(
    start_dt: datetime,
    end_dt: datetime,
    recurrency: Optional[str],
    range_start: datetime,
    range_end: datetime,
) -> list[tuple[datetime, datetime]]:
    """
    Ocorrências (início, fim), no fuso da aplicação, de um horário com ou sem RRULE.
    Recorrentes: as que começam dentro do intervalo. Simples: o próprio horário, se tocar o intervalo.
    """
    occurrences, _ = _expand(start_dt, end_dt, recurrency, range_start, range_end)
    return occurrences


def expand_local_reservation(
    reservation: Alocacao,
    range_start: datetime,
    range_end: datetime,
) -> list[dict]:
    """
    Retorna lista de eventos para uma reserva, expandindo recorrências no intervalo.
    Para reservas simples retorna lista com 1 elemento (ou vazia se fora do range).
    """
    occurrences, expanded = _expand(
        from_storage_datetime(reservation.dia_horario_inicio),
        from_storage_datetime(reservation.dia_horario_saida),
        reservation.recurrency,
        range_start,
        range_end,
    )
    if not expanded:
        return [build_local_event(reservation, start, end) for start, end in occurrences]
    return [
        build_local_event(reservation, start, end, f"{reservation.id}:{start.isoformat()}")
        for start, end in occurrences
    ]
