import pytest
from app.models.room import Sala
from app.models.type_room import TipoSala

def test_list_rooms_unauthorized(client):
    response = client.get("/rooms/")
    assert response.status_code == 401

def test_list_rooms_invalid_token(client):
    response = client.get("/rooms/", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401
    
def test_create_room(client, admin_token_headers):
    payload = {
        "nomeSala": 101,
        "descricao_sala": "Laboratório de Redes",
        "capacidade": 30
    }
    response = client.post("/rooms/", json=payload, headers=admin_token_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["nomeSala"] == 101
    assert data["capacidade"] == 30

def test_create_room_unauthorized(client):
    payload = {
        "nomeSala": 102,
        "descricao_sala": "Unauthorized",
        "capacidade": 20
    }
    response = client.post("/rooms/", json=payload)
    assert response.status_code == 401

def test_create_room_duplicate_code(client, admin_token_headers):
    payload = {
        "nomeSala": 501,
        "descricao_sala": "Room 501",
        "capacidade": 30
    }
    client.post("/rooms/", json=payload, headers=admin_token_headers)
    
    response = client.post("/rooms/", json=payload, headers=admin_token_headers)
    assert response.status_code == 409
    
def test_list_rooms_authorized(client, admin_token_headers):
    response = client.get("/rooms/", headers=admin_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1

def test_update_room(client, admin_token_headers, db_session):
    room = db_session.query(Sala).filter(Sala.codigo_sala == 101).first()
    assert room is not None
    
    payload = {
        "capacidade": 40
    }
    response = client.patch(f"/rooms/{room.id}", json=payload, headers=admin_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["capacidade"] == 40

def test_update_room_unauthorized(client, db_session):
    room = db_session.query(Sala).first()
    if not room:
        room = Sala(codigo_sala=777, descricao_sala="Temp Room")
        db_session.add(room)
        db_session.commit()
    payload = {"capacidade": 50}
    response = client.patch(f"/rooms/{room.id}", json=payload)
    assert response.status_code == 401

def test_update_non_existent_room(client, admin_token_headers):
    response = client.patch("/rooms/99999", json={"capacidade": 50}, headers=admin_token_headers)
    assert response.status_code == 404

def test_delete_room(client, admin_token_headers, db_session):
    room = db_session.query(Sala).filter(Sala.codigo_sala == 101).first()
    
    response = client.delete(f"/rooms/{room.id}", headers=admin_token_headers)
    assert response.status_code == 204
    
    room_deleted = db_session.query(Sala).filter(Sala.id == room.id).first()
    if room_deleted:
        assert room_deleted.ativada == False or room_deleted.sala_ativada == False

def test_delete_room_unauthorized(client, db_session):
    room = db_session.query(Sala).first()
    if not room:
        room = Sala(codigo_sala=888, descricao_sala="Temp Delete Room")
        db_session.add(room)
        db_session.commit()
        db_session.refresh(room)
    response = client.delete(f"/rooms/{room.id}")
    assert response.status_code == 401

def test_delete_non_existent_room(client, admin_token_headers):
    response = client.delete("/rooms/99999", headers=admin_token_headers)
    assert response.status_code == 404
