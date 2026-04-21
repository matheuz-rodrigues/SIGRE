import pytest
from app.models.user import Usuario

def test_get_me_unauthorized(client):
    response = client.get("/users/me")
    assert response.status_code == 401

def test_get_me_invalid_token(client):
    response = client.get("/users/me", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401

def test_get_me_authorized(client, admin_token_headers):
    response = client.get("/users/me", headers=admin_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "admin@uepa.br"

def test_list_users(client, admin_token_headers):
    response = client.get("/users/", headers=admin_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1

def test_list_users_unauthorized(client):
    response = client.get("/users/")
    assert response.status_code == 401

def test_create_user_admin(client, admin_token_headers, db_session):
    payload = {
        "nome": "New Staff",
        "email": "staff@uepa.br",
        "username": "staff1",
        "senha": "Str0ng_!@#Key",
        "tipo_usuario": 2, 
        "papel": "professor"
    }
    response = client.post("/users/", json=payload, headers=admin_token_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "staff@uepa.br"
    
    user = db_session.query(Usuario).filter(Usuario.email == "staff@uepa.br").first()
    assert user is not None
    assert user.status == "pendente" 

def test_create_user_unauthorized(client):
    payload = {"nome": "Unauth"}
    response = client.post("/users/", json=payload)
    assert response.status_code == 401

def test_approve_user(client, admin_token_headers, db_session):
    user = db_session.query(Usuario).filter(Usuario.email == "staff@uepa.br").first()
    assert user is not None
    
    response = client.patch(f"/users/approve/{user.id}", headers=admin_token_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "aprovado"

def test_approve_user_unauthorized(client):
    response = client.patch("/users/approve/1")
    assert response.status_code == 401

def test_update_user(client, admin_token_headers, db_session):
    user = db_session.query(Usuario).filter(Usuario.email == "staff@uepa.br").first()
    
    payload = {
        "nome": "Updated Staff Name"
    }
    response = client.patch(f"/users/{user.id}", json=payload, headers=admin_token_headers)
    assert response.status_code == 200
    assert response.json()["nome"] == "Updated Staff Name"

def test_update_user_unauthorized(client):
    response = client.patch("/users/1", json={"nome": "Hacked"})
    assert response.status_code == 401

def test_update_non_existent_user(client, admin_token_headers):
    response = client.patch("/users/99999", json={"nome": "Non-existent"}, headers=admin_token_headers)
    assert response.status_code == 404

def test_refuse_user(client, admin_token_headers, db_session):
    from app.services.security import hash_password
    other = Usuario(email="refuse@uepa.br", username="refuse", senha=hash_password("pwd"), tipo_usuario=1, status="pendente", nome="To Refuse")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)

    response = client.patch(f"/users/refuse/{other.id}", headers=admin_token_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "recusado"

def test_refuse_user_unauthorized(client):
    response = client.patch("/users/refuse/1")
    assert response.status_code == 401

def test_delete_user(client, admin_token_headers, db_session):
    user = db_session.query(Usuario).filter(Usuario.email == "staff@uepa.br").first()
    
    response = client.delete(f"/users/{user.id}", headers=admin_token_headers)
    assert response.status_code == 204
    
    # Check soft delete
    db_session.refresh(user)
    assert user.deleted_at is not None

def test_delete_user_unauthorized(client):
    response = client.delete("/users/1")
    assert response.status_code == 401
