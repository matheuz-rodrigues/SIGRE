import pytest
from app.models.professor import Professor

def test_create_professor_admin(client, admin_token_headers, db_session):
    payload = {
        "nomeProf": "Professor Teste",
        "emailProf": "prof@test.com",
        "matriculaProf": "123456"
    }
    response = client.post("/professors/", json=payload, headers=admin_token_headers)
    assert response.status_code == 201
    assert response.json()["nomeProf"] == "Professor Teste"


def test_create_professor_without_matricula(client, admin_token_headers):
    payload = {
        "nomeProf": "Testador da Silva",
        "emailProf": "testador.sem.matricula@test.com",
    }
    response = client.post("/professors/", json=payload, headers=admin_token_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["nomeProf"] == "Testador da Silva"
    assert data.get("matriculaProf") in (None, "")

def test_create_professor_unauthorized(client):
    payload = {
        "nomeProf": "Unauth Prof",
        "emailProf": "unauth@test.com",
        "matriculaProf": "999888"
    }
    response = client.post("/professors/", json=payload)
    assert response.status_code == 401

def test_create_professor_duplicate(client, admin_token_headers):
    payload = {
        "nomeProf": "Professor Teste",
        "emailProf": "prof@test.com",
        "matriculaProf": "123456"
    }
    response = client.post("/professors/", json=payload, headers=admin_token_headers)
    assert response.status_code == 409

def test_list_professors(client, admin_token_headers):
    response = client.get("/professors/", headers=admin_token_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert len(response.json()) >= 1

def test_list_professors_unauthorized(client):
    response = client.get("/professors/")
    assert response.status_code == 401

def test_update_professor(client, admin_token_headers, db_session):
    # Search for the professor in the DB (model uses snake_case 'email')
    prof = db_session.query(Professor).filter(Professor.email == "prof@test.com").first()
    payload = {"nomeProf": "Professor Teste Atualizado"}
    response = client.put(f"/professors/{prof.id}", json=payload, headers=admin_token_headers)
    assert response.status_code == 200
    assert response.json()["nomeProf"] == "Professor Teste Atualizado"

def test_update_professor_unauthorized(client, db_session):
    prof = db_session.query(Professor).first()
    if not prof:
        prof = Professor(nome="Temp", email="temp_prof@test.com", matricula="T1")
        db_session.add(prof)
        db_session.commit()
    response = client.put(f"/professors/{prof.id}", json={"nomeProf": "Hacked"})
    assert response.status_code == 401

def test_delete_professor(client, admin_token_headers, db_session):
    prof = db_session.query(Professor).filter(Professor.email == "prof@test.com").first()
    response = client.delete(f"/professors/{prof.id}", headers=admin_token_headers)
    assert response.status_code == 204
    assert db_session.query(Professor).filter(Professor.id == prof.id).first() is None

def test_delete_professor_unauthorized(client, db_session):
    prof = db_session.query(Professor).first()
    if not prof:
        prof = Professor(nome="Temp D", email="temp_d_prof@test.com", matricula="TD1")
        db_session.add(prof)
        db_session.commit()
        db_session.refresh(prof)
    response = client.delete(f"/professors/{prof.id}")
    assert response.status_code == 401


def test_update_professor_not_found(client, admin_token_headers):
    response = client.put(
        "/professors/99999",
        json={"nomeProf": "Não existe"},
        headers=admin_token_headers,
    )
    assert response.status_code == 404


def test_delete_professor_not_found(client, admin_token_headers):
    response = client.delete("/professors/99999", headers=admin_token_headers)
    assert response.status_code == 404
