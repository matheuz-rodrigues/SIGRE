import pytest
from app.models.course import Curso

def test_create_course_admin(client, admin_token_headers, db_session):
    payload = {
        "nomeCurso": "Engenharia de Software",
        "siglaCurso": "BES",
        "corCurso": "#FFFFFF"
    }
    response = client.post("/courses/", json=payload, headers=admin_token_headers)
    assert response.json()["nomeCurso"] == "Engenharia de Software"

def test_create_course_unauthorized(client):
    payload = {
        "nomeCurso": "Unauthorized Course",
        "siglaCurso": "UC",
        "corCurso": "#000000"
    }
    response = client.post("/courses/", json=payload)
    assert response.status_code == 401

def test_list_courses(client, admin_token_headers):
    response = client.get("/courses/", headers=admin_token_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert len(response.json()) >= 1

def test_list_courses_public(client):
    response = client.get("/courses/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_update_course(client, admin_token_headers, db_session):
    # Model uses 'sigla'
    course = db_session.query(Curso).filter(Curso.sigla == "BES").first()
    payload = {"nomeCurso": "Engenharia de Software de Qualidade"}
    response = client.put(f"/courses/{course.id}", json=payload, headers=admin_token_headers)
    assert response.status_code == 200
    assert response.json()["nomeCurso"] == "Engenharia de Software de Qualidade"

def test_update_course_unauthorized(client, db_session):
    course = db_session.query(Curso).first()
    if not course:
        # Create one if missing
        course = Curso(nome="Temp", sigla="TMP", cor="#000")
        db_session.add(course)
        db_session.commit()
    
    payload = {"nomeCurso": "Hacked"}
    response = client.put(f"/courses/{course.id}", json=payload)
    assert response.status_code == 401

def test_update_non_existent_course(client, admin_token_headers):
    response = client.put("/courses/99999", json={"nomeCurso": "Non-existent"}, headers=admin_token_headers)
    assert response.status_code == 404

def test_delete_course(client, admin_token_headers, db_session):
    course = db_session.query(Curso).filter(Curso.sigla == "BES").first()
    response = client.delete(f"/courses/{course.id}", headers=admin_token_headers)
    assert response.status_code == 204
    assert db_session.query(Curso).filter(Curso.id == course.id).first() is None

def test_delete_course_unauthorized(client, db_session):
    course = db_session.query(Curso).first()
    if not course:
        # Create one if missing
        course = Curso(nome="Temp Delete", sigla="TMPD", cor="#000")
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)

    response = client.delete(f"/courses/{course.id}")
    assert response.status_code == 401

def test_delete_non_existent_course(client, admin_token_headers):
    response = client.delete("/courses/99999", headers=admin_token_headers)
    assert response.status_code == 404


@pytest.mark.parametrize("cor", [
    "url(https://exemplo.com/rastreio.png)",
    "red;position:fixed",
    "#12345",
    "expression(alert(1))",
])
def test_course_color_must_be_hex(client, admin_token_headers, cor):
    payload = {"nomeCurso": "Curso Cor Inválida", "siglaCurso": "CCI", "corCurso": cor}
    assert client.post("/courses/", json=payload, headers=admin_token_headers).status_code == 422


def test_course_color_hex_is_accepted(client, admin_token_headers):
    payload = {"nomeCurso": "Curso Cor Válida", "siglaCurso": "CCV", "corCurso": "#1C1AA3"}
    response = client.post("/courses/", json=payload, headers=admin_token_headers)
    assert response.status_code in (200, 201)
    course_id = response.json()["idCurso"]
    bad = client.put(f"/courses/{course_id}", json={"corCurso": "url(https://exemplo.com/x.png)"}, headers=admin_token_headers)
    assert bad.status_code == 422
