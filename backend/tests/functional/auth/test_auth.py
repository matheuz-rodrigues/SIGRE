import pytest
from app.models.user import Usuario
from app.schemas.user import UserCreate

def test_register_user(client, db_session):
    # Test valid registration
    payload = {
        "nome": "Test User",
        "email": "testuser@aluno.uepa.br",
        "username": "testuser1",
        "senha": "StrongP@ssw0rd!!",
        "tipo_usuario": 1 # aluno
    }
    
    response = client.post("/auth/register", json=payload)
    
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["message"] == "Cadastro realizado com sucesso"
    
    # Verify in DB
    user = db_session.query(Usuario).filter(Usuario.email == "testuser@aluno.uepa.br").first()
    assert user is not None
    assert user.username == "testuser1"

def test_register_duplicate_email(client, db_session):
    payload = {
        "nome": "Another Test",
        "email": "testuser@aluno.uepa.br", # Duplicate
        "username": "anothertest",
        "senha": "StrongP@ssw0rd!!",
        "tipo_usuario": 1
    }
    
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 409
    assert "E-mail já cadastrado" in response.json()["detail"]

def test_register_duplicate_username(client, db_session):
    payload = {
        "nome": "Another Test",
        "email": "different_email@aluno.uepa.br",
        "username": "testuser1", # Duplicate
        "senha": "StrongP@ssw0rd!!",
        "tipo_usuario": 1
    }
    
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 409
    assert "Nome de usuário já em uso" in response.json()["detail"]

def test_register_missing_fields(client):
    payload = {
        "nome": "Missing Fields",
        "email": "missing@test.com"
        # missing username, senha, tipo_usuario
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 422

def test_login_success(client, db_session):
    # Ensure user exists before logging in
    payload = {
        "nome": "Login Test User",
        "email": "logintest@aluno.uepa.br",
        "username": "logintest1",
        "senha": "StrongP@ssw0rd!!",
        "tipo_usuario": 1 # aluno
    }
    client.post("/auth/register", json=payload)
    
    # Approve the created user to allow login
    user = db_session.query(Usuario).filter(Usuario.email == "logintest@aluno.uepa.br").first()
    user.status = "aprovado"
    db_session.commit()
    
    login_data = {
        "username": "logintest@aluno.uepa.br", 
        "senha": "StrongP@ssw0rd!!"
    }
    
    response = client.post("/auth/login", json=login_data)
    assert response.status_code == 200
    data = response.json()
    # Token só em cookie HttpOnly; o corpo traz o token CSRF
    assert "access_token" not in data
    assert response.cookies.get("access_token")
    assert data["csrf_token"] == response.cookies.get("csrf_token")
    assert data["token_type"] == "bearer"
    assert data["email"] == "logintest@aluno.uepa.br"
    assert data["papel"] == "aluno"

def test_login_success_by_email(client, db_session):
    # Already covered by test_login_success, but let's test specifically by username if it was used for email
    login_data = {
        "username": "logintest1", 
        "senha": "StrongP@ssw0rd!!"
    }
    response = client.post("/auth/login", json=login_data)
    assert response.status_code == 200
    assert response.json()["username"] == "logintest1"

def test_login_invalid_credentials(client, db_session):
    # Ensure user exists
    payload = {
        "nome": "Invalid Login Test User",
        "email": "invalidlogintest@aluno.uepa.br",
        "username": "invalidlogintest1",
        "senha": "StrongP@ssw0rd!!",
        "tipo_usuario": 1
    }
    client.post("/auth/register", json=payload)

    login_data = {
        "username": "invalidlogintest@aluno.uepa.br",
        "senha": "wrongpassword"
    }
    
    response = client.post("/auth/login", json=login_data)
    assert response.status_code == 401
    assert "Usuário ou senha incorretos" in response.json()["detail"]

def test_login_non_existent_user(client):
    login_data = {
        "username": "nonexistent@test.com",
        "senha": "StrongP@ssw0rd!!"
    }
    response = client.post("/auth/login", json=login_data)
    assert response.status_code == 401

def test_login_unapproved_user(client, db_session):
    # Register pending user directly to DB
    from app.services.auth.security import hash_password
    pending_user = Usuario(
        email="pending@test.com",
        username="pending_test",
        senha=hash_password("StrongP@ssw0rd!!"),
        tipo_usuario=2, # Professor
        status="pendente",
        nome="Pending User"
    )
    db_session.add(pending_user)
    db_session.commit()
    
    login_data = {
        "username": "pending@test.com",
        "senha": "StrongP@ssw0rd!!"
    }
    response = client.post("/auth/login", json=login_data)
    assert response.status_code == 403 or response.status_code == 401
    assert "aguarda aprovação" in response.json()["detail"]

def test_login_token_standard_endpoint(client, db_session):
    # Test OAuth2 /token endpoint
    form_data = {
        "username": "logintest@aluno.uepa.br",
        "password": "StrongP@ssw0rd!!"
    }
    response = client.post("/auth/token", data=form_data)
    assert response.status_code == 200
    assert "access_token" in response.json()
