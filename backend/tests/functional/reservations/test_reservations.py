import pytest
from datetime import datetime, timedelta
from app.models.room import Sala
from app.models.allocation import Alocacao

def test_create_reservation_success(client, admin_token_headers, db_session, test_admin_user):
    # Create a room first
    room = Sala(codigo_sala=201, descricao_sala="Sala de Teste 201")
    db_session.add(room)
    db_session.commit()
    db_session.refresh(room)
    
    start_time = datetime.now() + timedelta(days=1)
    end_time = start_time + timedelta(hours=2)
    
    payload = {
        "fk_usuario": test_admin_user.id,
        "salaId": room.id,
        "tipo": "Aula",
        "dia_horario_inicio": start_time.isoformat(),
        "dia_horario_saida": end_time.isoformat(),
        "status": "PENDING"
    }
    
    response = client.post("/reservations/", json=payload, headers=admin_token_headers)
    assert response.status_code == 201
    data = response.json()
    assert "id" in data # It returns build_local_event which has ID

def test_create_reservation_unauthorized(client, test_admin_user, db_session):
    room = db_session.query(Sala).first()
    payload = {
        "fk_usuario": test_admin_user.id,
        "salaId": room.id,
        "tipo": "Aula",
        "dia_horario_inicio": (datetime.now() + timedelta(days=1)).isoformat(),
        "dia_horario_saida": (datetime.now() + timedelta(days=1, hours=1)).isoformat()
    }
    response = client.post("/reservations/", json=payload)
    assert response.status_code == 401

def test_create_reservation_invalid_times(client, admin_token_headers, db_session, test_admin_user):
    room = db_session.query(Sala).first()
    start_time = datetime.now() + timedelta(days=5)
    end_time = start_time - timedelta(hours=1) # Invalid
    
    payload = {
        "fk_usuario": test_admin_user.id,
        "salaId": room.id,
        "tipo": "Aula",
        "dia_horario_inicio": start_time.isoformat(),
        "dia_horario_saida": end_time.isoformat()
    }
    response = client.post("/reservations/", json=payload, headers=admin_token_headers)
    assert response.status_code == 400
    assert "posterior" in response.json()["detail"]
    
def test_list_reservations(client, admin_token_headers):
    response = client.get("/reservations/", headers=admin_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)

def test_list_reservations_unauthorized(client):
    response = client.get("/reservations/")
    assert response.status_code == 401


def test_update_reservation(client, admin_token_headers, db_session, test_admin_user):
    room = db_session.query(Sala).first()
    start_time = datetime.now() + timedelta(days=2)
    end_time = start_time + timedelta(hours=2)
    res = Alocacao(
        fk_usuario=test_admin_user.id,
        fk_sala=room.id,
        tipo="Aula",
        dia_horario_inicio=start_time,
        dia_horario_saida=end_time,
        status="PENDING",
    )
    db_session.add(res)
    db_session.commit()
    db_session.refresh(res)

    new_end = end_time + timedelta(hours=1)
    response = client.patch(
        f"/reservations/{res.id}",
        json={"uso": "Atualizado", "dia_horario_saida": new_end.isoformat()},
        headers=admin_token_headers,
    )
    assert response.status_code == 200
    assert response.json().get("summary") == "Atualizado"
    db_session.refresh(res)
    assert res.uso == "Atualizado"


def test_update_reservation_unauthorized(client, db_session, test_admin_user):
    room = db_session.query(Sala).first()
    res = db_session.query(Alocacao).first()
    if not res:
        start_time = datetime.now() + timedelta(days=3)
        res = Alocacao(
            fk_usuario=test_admin_user.id,
            fk_sala=room.id,
            tipo="Aula",
            dia_horario_inicio=start_time,
            dia_horario_saida=start_time + timedelta(hours=1),
            status="PENDING",
        )
        db_session.add(res)
        db_session.commit()
        db_session.refresh(res)
    response = client.patch(f"/reservations/{res.id}", json={"uso": "Hack"})
    assert response.status_code == 401


def test_approve_reservation(client, admin_token_headers, db_session):
    res = db_session.query(Alocacao).filter(Alocacao.status == "PENDING").first()
    assert res is not None
    
    response = client.patch(f"/reservations/approve/{res.id}", headers=admin_token_headers)
    assert response.status_code == 200
    assert "aprovada" in response.json()["message"].lower()
    
    db_session.refresh(res)
    assert res.status == "APPROVED"

def test_approve_non_existent_reservation(client, admin_token_headers):
    response = client.patch("/reservations/approve/99999", headers=admin_token_headers)
    assert response.status_code == 404

def test_refuse_reservation(client, admin_token_headers, db_session):
    # Create another pending one
    room = db_session.query(Sala).first()
    user = db_session.query(Alocacao).first().fk_usuario
    other = Alocacao(
        fk_usuario=user,
        fk_sala=room.id,
        tipo="Reunião",
        dia_horario_inicio=datetime.now(),
        dia_horario_saida=datetime.now() + timedelta(hours=1),
        status="PENDING"
    )
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)

    response = client.patch(f"/reservations/refuse/{other.id}", headers=admin_token_headers)
    assert response.status_code == 200
    assert "rejeitada" in response.json()["message"].lower()

def test_refuse_non_existent_reservation(client, admin_token_headers):
    response = client.patch("/reservations/refuse/99999", headers=admin_token_headers)
    assert response.status_code == 404

def test_delete_reservation(client, admin_token_headers, db_session):
    res = db_session.query(Alocacao).first()
    
    response = client.delete(f"/reservations/{res.id}", headers=admin_token_headers)
    assert response.status_code == 200
    assert "Deletado" in response.json()["message"]
    
    assert db_session.query(Alocacao).filter(Alocacao.id == res.id).first() is None

def test_delete_reservation_unauthorized(client, db_session):
    res = db_session.query(Alocacao).first()
    response = client.delete(f"/reservations/{res.id}")
    assert response.status_code == 401
