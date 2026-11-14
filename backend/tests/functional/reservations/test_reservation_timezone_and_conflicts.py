"""Fuso na criação/edição direta (B3), conflito de sala no banco (B4) e dono do evento Google."""
from datetime import date, datetime, time
from itertools import count
from unittest.mock import patch

import pytest

from app.models.allocation import Alocacao
from app.models.room import Sala
from app.models.solicitation import Solicitacao

_room_codes = count(9100)


@pytest.fixture
def room(db_session):
    sala = Sala(codigo_sala=str(next(_room_codes)), descricao_sala="Sala de teste")
    db_session.add(sala)
    db_session.commit()
    db_session.refresh(sala)
    return sala


def _create(client, headers, user, sala, start, end, status="APPROVED", **extra):
    payload = {
        "fk_usuario": user.id,
        "salaId": sala.id,
        "tipo": "EVENTO",
        "uso": "Teste",
        "dia_horario_inicio": start,
        "dia_horario_saida": end,
        "status": status,
        **extra,
    }
    return client.post("/reservations/", json=payload, headers=headers)


def _stored(db_session, response) -> Alocacao:
    assert response.status_code == 201, response.text
    alocacao = db_session.get(Alocacao, int(str(response.json()["id"]).split(":")[0]))
    db_session.refresh(alocacao)
    return alocacao


# ---------- B3: horário gravado na hora de Belém ----------

def test_create_with_utc_is_stored_in_belem_time(client, admin_token_headers, test_admin_user, db_session, room):
    # 10:00–11:00 em Belém, como o front manda (toISOString)
    resp = _create(client, admin_token_headers, test_admin_user, room, "2026-11-16T13:00:00Z", "2026-11-16T14:00:00Z")
    alocacao = _stored(db_session, resp)
    assert alocacao.dia_horario_inicio == datetime(2026, 11, 16, 10, 0)
    assert alocacao.dia_horario_saida == datetime(2026, 11, 16, 11, 0)


def test_create_with_offset_keeps_local_time(client, admin_token_headers, test_admin_user, db_session, room):
    resp = _create(
        client, admin_token_headers, test_admin_user, room, "2026-11-17T09:00:00-03:00", "2026-11-17T10:00:00-03:00"
    )
    alocacao = _stored(db_session, resp)
    assert alocacao.dia_horario_inicio == datetime(2026, 11, 17, 9, 0)


def test_update_with_utc_is_stored_in_belem_time(client, admin_token_headers, test_admin_user, db_session, room):
    resp = _create(client, admin_token_headers, test_admin_user, room, "2026-11-18T13:00:00Z", "2026-11-18T14:00:00Z")
    alocacao = _stored(db_session, resp)

    # Só o fim vem com fuso; o início continua o do banco (sem fuso)
    update = client.patch(
        f"/reservations/{alocacao.id}", json={"dia_horario_saida": "2026-11-18T15:00:00Z"}, headers=admin_token_headers
    )
    assert update.status_code == 200, update.text
    db_session.refresh(alocacao)
    assert alocacao.dia_horario_inicio == datetime(2026, 11, 18, 10, 0)
    assert alocacao.dia_horario_saida == datetime(2026, 11, 18, 12, 0)


def test_weekly_range_ends_on_last_local_day(client, admin_token_headers, test_admin_user, db_session, room):
    # Segundas 08:00–10:00 de 03/08 a 31/08 (Belém), enviado em UTC
    resp = _create(
        client, admin_token_headers, test_admin_user, room,
        "2026-08-03T11:00:00Z", "2026-08-31T13:00:00Z", diaSemana="Segunda",
    )
    alocacao = _stored(db_session, resp)
    assert alocacao.dia_horario_inicio == datetime(2026, 8, 3, 8, 0)
    assert alocacao.dia_horario_saida == datetime(2026, 8, 3, 10, 0)
    assert "UNTIL=20260901T025959Z" in alocacao.recurrency
    assert alocacao.data_fim == datetime(2026, 8, 31, 23, 59, 59)


# ---------- B4: conflito de sala no banco ----------

def test_overlapping_approved_reservation_is_rejected(client, admin_token_headers, test_admin_user, room):
    assert _create(
        client, admin_token_headers, test_admin_user, room, "2026-12-01T13:00:00Z", "2026-12-01T14:00:00Z"
    ).status_code == 201
    resp = _create(client, admin_token_headers, test_admin_user, room, "2026-12-01T13:30:00Z", "2026-12-01T14:30:00Z")
    assert resp.status_code == 409
    assert "01/12/2026 das 10:00 às 11:00" in resp.json()["detail"]


def test_adjacent_and_other_room_are_allowed(client, admin_token_headers, test_admin_user, db_session, room):
    assert _create(
        client, admin_token_headers, test_admin_user, room, "2026-12-02T13:00:00Z", "2026-12-02T14:00:00Z"
    ).status_code == 201
    adjacent = _create(client, admin_token_headers, test_admin_user, room, "2026-12-02T14:00:00Z", "2026-12-02T15:00:00Z")
    assert adjacent.status_code == 201

    other = Sala(codigo_sala=str(next(_room_codes)), descricao_sala="Outra sala")
    db_session.add(other)
    db_session.commit()
    same_time = _create(client, admin_token_headers, test_admin_user, other, "2026-12-02T13:00:00Z", "2026-12-02T14:00:00Z")
    assert same_time.status_code == 201


def test_recurring_reservation_conflicts_in_later_week(client, admin_token_headers, test_admin_user, room):
    # Avulsa na 3ª segunda (21/12) e aula semanal às segundas desde 07/12
    assert _create(
        client, admin_token_headers, test_admin_user, room, "2026-12-21T12:00:00Z", "2026-12-21T13:00:00Z"
    ).status_code == 201
    resp = _create(
        client, admin_token_headers, test_admin_user, room,
        "2026-12-07T11:00:00Z", "2026-12-07T13:00:00Z",
        recurrency="RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261229T025959Z",
    )
    assert resp.status_code == 409
    assert "21/12/2026" in resp.json()["detail"]


def test_pending_does_not_block_but_approving_it_does(client, admin_token_headers, test_admin_user, db_session, room):
    assert _create(
        client, admin_token_headers, test_admin_user, room, "2026-12-03T13:00:00Z", "2026-12-03T14:00:00Z"
    ).status_code == 201
    pending = _create(
        client, admin_token_headers, test_admin_user, room,
        "2026-12-03T13:00:00Z", "2026-12-03T14:00:00Z", status="PENDING",
    )
    alocacao = _stored(db_session, pending)

    resp = client.patch(f"/reservations/approve/{alocacao.id}", headers=admin_token_headers)
    assert resp.status_code == 409
    db_session.refresh(alocacao)
    assert alocacao.status == "PENDING"


def test_update_into_conflict_is_rejected(client, admin_token_headers, test_admin_user, db_session, room):
    assert _create(
        client, admin_token_headers, test_admin_user, room, "2026-12-04T13:00:00Z", "2026-12-04T14:00:00Z"
    ).status_code == 201
    later = _stored(
        db_session,
        _create(client, admin_token_headers, test_admin_user, room, "2026-12-04T15:00:00Z", "2026-12-04T16:00:00Z"),
    )
    resp = client.patch(
        f"/reservations/{later.id}",
        json={"dia_horario_inicio": "2026-12-04T13:30:00Z", "dia_horario_saida": "2026-12-04T14:30:00Z"},
        headers=admin_token_headers,
    )
    assert resp.status_code == 409
    db_session.refresh(later)
    assert later.dia_horario_inicio == datetime(2026, 12, 4, 12, 0)


def test_approving_conflicting_solicitation_is_rejected(client, admin_token_headers, test_admin_user, db_session, room):
    assert _create(
        client, admin_token_headers, test_admin_user, room, "2026-12-07T13:00:00Z", "2026-12-07T15:00:00Z"
    ).status_code == 201
    solicitacao = Solicitacao(
        solicitante="Admin Test", email=test_admin_user.email, papel="professor",
        motivo="Reunião", descricao="Conflita com a reserva", dia_semana="Segunda",
        data_evento=date(2026, 12, 7), horario_inicio=time(11, 0), horario_fim=time(12, 0),
        fk_sala=room.id, status="pendente",
    )
    db_session.add(solicitacao)
    db_session.commit()
    before = db_session.query(Alocacao).filter(Alocacao.fk_sala == room.id).count()

    resp = client.patch(
        f"/solicitations/{solicitacao.id}/status", json={"status": "aprovado"}, headers=admin_token_headers
    )
    assert resp.status_code == 409
    assert db_session.query(Alocacao).filter(Alocacao.fk_sala == room.id).count() == before
    db_session.refresh(solicitacao)
    assert solicitacao.status == "pendente"


# ---------- Credencial Google de quem criou o evento ----------

def test_owner_is_recorded_and_used_on_delete(client, admin_token_headers, test_admin_user, db_session, room):
    alocacao = _stored(
        db_session,
        _create(client, admin_token_headers, test_admin_user, room, "2026-12-08T13:00:00Z", "2026-12-08T14:00:00Z"),
    )
    assert alocacao.google_owner_id == test_admin_user.id

    with patch("app.services.calendar.google_calendar.delete_event", return_value=True) as delete_event:
        assert client.delete(f"/reservations/{alocacao.id}", headers=admin_token_headers).status_code == 200
    assert delete_event.call_args.kwargs["user_id"] == test_admin_user.id


def test_legacy_reservation_finds_owner_among_connected_accounts(
    client, admin_token_headers, test_admin_user, db_session, room
):
    from app.models import GoogleCredential
    from app.models.user import Usuario

    other_admin = Usuario(
        nome="Outro Admin", email="outro.admin@test.com", username="outro_admin",
        senha="x", tipo_usuario=3, status="aprovado",
    )
    db_session.add(other_admin)
    db_session.commit()
    db_session.add(GoogleCredential(user_id=other_admin.id, access_token="t"))
    alocacao = Alocacao(
        fk_usuario=test_admin_user.id, fk_sala=room.id, tipo="EVENTO", status="APPROVED",
        dia_horario_inicio=datetime(2026, 12, 9, 10, 0), dia_horario_saida=datetime(2026, 12, 9, 11, 0),
        google_event_id="evento_legado",
    )
    db_session.add(alocacao)
    db_session.commit()

    def only_other_admin_has_it(db, user_id, event_id):
        return {"id": event_id} if user_id == other_admin.id else None

    with patch("app.services.calendar.google_calendar.get_event_by_id", side_effect=only_other_admin_has_it), \
         patch("app.services.calendar.google_calendar.delete_event", return_value=True) as delete_event:
        assert client.delete(f"/reservations/{alocacao.id}", headers=admin_token_headers).status_code == 200
    assert delete_event.call_args.kwargs["user_id"] == other_admin.id


# ---------- B9: data de criação da solicitação com fuso ----------

def test_solicitation_created_at_has_utc_offset(client, admin_token_headers, test_admin_user, db_session, room):
    db_session.add(Solicitacao(
        solicitante="Admin Test", email=test_admin_user.email, papel="professor",
        motivo="Fuso", descricao="Data de criação", dia_semana="Terça",
        horario_inicio=time(8, 0), horario_fim=time(9, 0), fk_sala=room.id,
    ))
    db_session.commit()
    resp = client.get("/solicitations/", headers=admin_token_headers)
    assert resp.status_code == 200
    assert all(s["criadoEm"].endswith("+00:00") for s in resp.json())
